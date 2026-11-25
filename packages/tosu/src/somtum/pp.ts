/**
 * pp from somtum-pp: what the somtum.fun server pays, Relax and Autopilot included (the lazer
 * calculator tosu ships has no Relax/Autopilot pp). tosu keeps its own calculator for everything
 * else (strains graph, hit windows, difficulty breakdown); the pp numbers, and the stars of a
 * Relax/Autopilot play, come from here.
 */
import { SomtumMap, type SomtumPerf, type SomtumScore } from '@somtum/pp';
import { wLogger } from '@tosu/common';
import type { PerformanceAttrsData } from '@tosuapp/lazer-calculator-prebuilt';

import type { Statistics } from '@/states/types';
import { toLegacyHits } from '@/utils/hitResult';
import type { CalculateMods } from '@/utils/osuMods.types';

export const RELAX = 128;
export const AUTOPILOT = 8192;

/** A stable play's objects judged so far, from its stable hit counts. */
export function judgedObjects(
    mode: number,
    hits: {
        0: number;
        50: number;
        100: number;
        300: number;
        geki: number;
        katu: number;
    }
): number {
    switch (mode) {
        case 1:
            return hits[300] + hits[100] + hits[0];
        case 2:
            // fruits + droplets + misses; tiny droplets (50/katu) aren't objects
            return hits[300] + hits[100] + hits[0];
        case 3:
            return (
                hits.geki +
                hits[300] +
                hits.katu +
                hits[100] +
                hits[50] +
                hits[0]
            );
        default:
            return hits[300] + hits[100] + hits[50] + hits[0];
    }
}

export class SomtumPerformance {
    private map: SomtumMap | null = null;
    private content = '';

    /** Parses the beatmap if it changed. false when somtum-pp can't calculate it. */
    load(content: string): boolean {
        if (content === this.content) return this.map !== null;
        this.map?.free();
        this.content = content;
        try {
            this.map = SomtumMap.parse(content);
        } catch (exc) {
            wLogger.debug('somtum-pp: parse failed', exc);
            this.map = null;
        }
        return this.map !== null;
    }

    get ready() {
        return this.map !== null;
    }

    get nObjects() {
        return this.map?.nObjects ?? 0;
    }

    private base(
        mode: number,
        mods: CalculateMods,
        lazer: boolean
    ): SomtumScore {
        const rate = mods.rate;
        return {
            mode,
            mods: mods.number >>> 0,
            lazer,
            // stable's rate mods always run at their usual speed; only lazer has custom rates
            clockRate: lazer && rate && rate !== 1 ? rate : undefined
        };
    }

    /** pp at an accuracy (0-100) over the whole map: the song-select table, "if FC". */
    atAccuracy(
        mode: number,
        mods: CalculateMods,
        accuracy: number,
        lazer: boolean,
        misses = 0
    ): SomtumPerf | null {
        if (!this.map) return null;
        return this.map.calculate({
            ...this.base(mode, mods, lazer),
            accuracy: Math.max(0, Math.min(100, accuracy)),
            nMiss: misses
        });
    }

    /** pp of a play from its hit counts; `partial` = still playing (only the objects judged). */
    fromStatistics(
        mode: number,
        mods: CalculateMods,
        statistics: Statistics,
        maxCombo: number,
        opts: { lazer: boolean; partial: boolean; legacyTotalScore?: number }
    ): SomtumPerf | null {
        if (!this.map) return null;
        const hits = toLegacyHits(mode, statistics);
        const judged = judgedObjects(mode, hits);
        if (opts.partial && judged === 0) return null;
        return this.map.calculate({
            ...this.base(mode, mods, opts.lazer),
            maxCombo,
            n300: hits[300],
            n100: hits[100],
            n50: hits[50],
            nGeki: hits.geki,
            nKatu: hits.katu,
            nMiss: hits[0],
            largeTickHits: opts.lazer ? hits.largeTickHits : undefined,
            sliderEndHits: opts.lazer ? hits.sliderEndHits : undefined,
            passedObjects:
                opts.partial && judged < this.nObjects ? judged : undefined,
            legacyTotalScore: opts.lazer ? undefined : opts.legacyTotalScore
        });
    }

    /** The same play with the rest of the map hit perfectly and no new misses. */
    maxAchievable(
        mode: number,
        mods: CalculateMods,
        statistics: Statistics,
        maxCombo: number,
        currentCombo: number,
        lazer: boolean
    ): SomtumPerf | null {
        if (!this.map) return null;
        const hits = toLegacyHits(mode, statistics);
        const remaining = Math.max(
            0,
            this.nObjects - judgedObjects(mode, hits)
        );
        return this.map.calculate({
            ...this.base(mode, mods, lazer),
            maxCombo: Math.max(maxCombo, currentCombo + remaining),
            n300: hits[300] + remaining,
            n100: hits[100],
            n50: hits[50],
            nGeki: hits.geki,
            nKatu: hits.katu,
            nMiss: hits[0]
        });
    }

    /** The play's misses turned into 300s, at full combo. */
    fullCombo(
        mode: number,
        mods: CalculateMods,
        statistics: Statistics,
        lazer: boolean
    ): SomtumPerf | null {
        if (!this.map) return null;
        const hits = toLegacyHits(mode, statistics);
        const remaining = Math.max(
            0,
            this.nObjects - judgedObjects(mode, hits)
        );
        return this.map.calculate({
            ...this.base(mode, mods, lazer),
            n300: hits[300] + hits[0] + remaining,
            n100: hits[100],
            n50: hits[50],
            nGeki: hits.geki,
            nKatu: hits.katu,
            nMiss: 0
        });
    }

    free() {
        this.map?.free();
        this.map = null;
        this.content = '';
    }
}

/** somtum-pp's breakdown in tosu's shape (ppDifficulty: taiko/mania's difficulty part). */
export function toTosuAttributes(
    p: SomtumPerf,
    fallback?: PerformanceAttrsData
): PerformanceAttrsData {
    return {
        ...(fallback ?? ({} as PerformanceAttrsData)),
        pp: p.pp,
        aim: p.ppAim,
        speed: p.ppSpeed,
        accuracy: p.ppAcc,
        flashlight: p.ppFlashlight
    } as PerformanceAttrsData;
}

/** Relax/Autopilot plays get somtum-pp's stars too: their calculators rate the map differently. */
export function isRelaxOrAutopilot(mods: CalculateMods) {
    return ((mods.number >>> 0) & (RELAX | AUTOPILOT)) !== 0;
}
