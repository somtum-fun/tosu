// somtum-pp for Node and browsers: the WebAssembly build behind a small class API.
// The .wasm is embedded (wasm.mjs, base64), so bundlers and single-exe packagers need no asset.
import { WASM_BASE64 } from './wasm.mjs';

const SCORE_FIELDS = ['mode', 'mods', 'lazer', 'clockRate', 'maxCombo', 'n300', 'n100', 'n50', 'nGeki', 'nKatu', 'nMiss', 'largeTickHits', 'sliderEndHits', 'passedObjects', 'legacyTotalScore', 'accuracy'];
const SCORE_DEFAULTS = { mode: 0, mods: 0, lazer: 0, clockRate: -1, maxCombo: -1, n300: 0, n100: 0, n50: 0, nGeki: 0, nKatu: 0, nMiss: 0, largeTickHits: -1, sliderEndHits: -1, passedObjects: -1, legacyTotalScore: -1, accuracy: -1 };
const PERF_FIELDS = ['pp', 'ppAim', 'ppSpeed', 'ppAcc', 'ppFlashlight', 'stars', 'maxCombo', 'effectiveMissCount', 'calculator'];
const STATS_FIELDS = ['ar', 'od', 'cs', 'hp', 'clockRate', 'nObjects', 'mode'];

/** 0 official (ppy), 1 relax (akatsuki osu_2019), 2 akatsuki (autopilot, relax on taiko/catch/mania). */
export const CALCULATORS = ['official', 'relax', 'akatsuki'];

function decodeBase64(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

const { exports: w } = new WebAssembly.Instance(new WebAssembly.Module(decodeBase64(WASM_BASE64)), {});
if (w.spp_abi_score_fields() !== SCORE_FIELDS.length) throw new Error('somtum-pp: wasm/JS ABI mismatch');

// Scratch structs, allocated once. Views are rebuilt per call: memory.grow detaches old ones.
const SCORE_PTR = w.spp_alloc(SCORE_FIELDS.length * 8);
const OUT_PTR = w.spp_alloc(Math.max(PERF_FIELDS.length, STATS_FIELDS.length) * 8);
const SECTION_PTR = w.spp_alloc(8);
const f64 = (ptr, n) => new Float64Array(w.memory.buffer, ptr, n);

function writeScore(score) {
    const view = f64(SCORE_PTR, SCORE_FIELDS.length);
    SCORE_FIELDS.forEach((k, i) => {
        let v = score[k] ?? SCORE_DEFAULTS[k];
        if (typeof v === 'boolean') v = v ? 1 : 0;
        view[i] = Number.isFinite(v) ? v : SCORE_DEFAULTS[k];
    });
}

function readStruct(fields) {
    const view = f64(OUT_PTR, fields.length);
    const out = {};
    fields.forEach((k, i) => (out[k] = view[i]));
    return out;
}

const registry = typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry((ptr) => w.spp_map_free(ptr)) : null;

export class SomtumMap {
    #ptr;
    constructor(ptr) {
        this.#ptr = ptr;
        registry?.register(this, ptr, this);
    }

    /** Parses .osu content (string or bytes). `null` when it can't be parsed or is too suspicious. */
    static parse(content) {
        const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
        if (!bytes || bytes.length === 0) return null;
        const p = w.spp_alloc(bytes.length);
        new Uint8Array(w.memory.buffer, p, bytes.length).set(bytes);
        const ptr = w.spp_map_new(p, bytes.length);
        w.spp_free_bytes(p, bytes.length);
        return ptr ? new SomtumMap(ptr) : null;
    }

    get mode() {
        return w.spp_map_mode(this.#ptr);
    }

    get nObjects() {
        return w.spp_map_n_objects(this.#ptr);
    }

    /** pp as the somtum server pays it. Unset fields: whole map, full combo, no rate change. */
    calculate(score = {}) {
        if (!this.#ptr) return null;
        writeScore(score);
        if (w.spp_calculate(this.#ptr, SCORE_PTR, OUT_PTR) !== 0) return null;
        const out = readStruct(PERF_FIELDS);
        out.calculatorName = CALCULATORS[out.calculator] ?? 'none';
        return out;
    }

    /** AR/OD/CS/HP with mods and rate applied (only mode, mods, lazer, clockRate are read). */
    stats(score = {}) {
        if (!this.#ptr) return null;
        writeScore(score);
        return w.spp_stats(this.#ptr, SCORE_PTR, OUT_PTR) === 0 ? readStruct(STATS_FIELDS) : null;
    }

    /** Difficulty graph: `{ sectionLength, values }`. */
    strains(score = {}) {
        if (!this.#ptr) return null;
        writeScore(score);
        const n = Number(w.spp_strains(this.#ptr, SCORE_PTR, 0, 0, SECTION_PTR));
        if (n < 0) return null;
        const buf = w.spp_alloc(Math.max(n, 1) * 8);
        writeScore(score);
        w.spp_strains(this.#ptr, SCORE_PTR, buf, n, SECTION_PTR);
        const values = Float64Array.from(f64(buf, n));
        const sectionLength = f64(SECTION_PTR, 1)[0];
        w.spp_free_bytes(buf, Math.max(n, 1) * 8);
        return { sectionLength, values };
    }

    free() {
        if (this.#ptr) {
            registry?.unregister(this);
            w.spp_map_free(this.#ptr);
            this.#ptr = 0;
        }
    }
}

/** Which calculator pays a play: 0 official, 1 relax, 2 akatsuki. */
export function route(mode, mods) {
    return w.spp_route(mode, mods >>> 0);
}

export const version = (() => {
    const p = w.spp_version();
    const mem = new Uint8Array(w.memory.buffer);
    let end = p;
    while (mem[end] !== 0) end++;
    return new TextDecoder().decode(mem.subarray(p, end));
})();

export const RELAX = 128;
export const AUTOPILOT = 8192;
