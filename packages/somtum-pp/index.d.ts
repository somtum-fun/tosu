export interface SomtumScore {
    /** Vanilla ruleset 0-3 (osu! maps convert). */
    mode?: number;
    /** Legacy mod bits; Relax 128, Autopilot 8192. */
    mods?: number;
    lazer?: boolean;
    /** A lazer rate mod's own speed; omit for the mod's usual speed. */
    clockRate?: number;
    maxCombo?: number;
    n300?: number;
    n100?: number;
    n50?: number;
    nGeki?: number;
    nKatu?: number;
    nMiss?: number;
    largeTickHits?: number;
    sliderEndHits?: number;
    /** Objects judged so far; omit for the whole map. */
    passedObjects?: number;
    legacyTotalScore?: number;
    /** 0-100: generate hits from this accuracy (with nMiss misses) instead of the n* counts. */
    accuracy?: number;
}

export interface SomtumPerf {
    pp: number;
    ppAim: number;
    ppSpeed: number;
    ppAcc: number;
    ppFlashlight: number;
    stars: number;
    maxCombo: number;
    effectiveMissCount: number;
    /** 0 official, 1 relax (osu_2019), 2 akatsuki. */
    calculator: number;
    calculatorName: 'official' | 'relax' | 'akatsuki' | 'none';
}

export interface SomtumStats {
    ar: number;
    od: number;
    cs: number;
    hp: number;
    clockRate: number;
    nObjects: number;
    mode: number;
}

export declare class SomtumMap {
    static parse(content: string | Uint8Array): SomtumMap | null;
    readonly mode: number;
    readonly nObjects: number;
    calculate(score?: SomtumScore): SomtumPerf | null;
    stats(score?: SomtumScore): SomtumStats | null;
    strains(score?: SomtumScore): { sectionLength: number; values: Float64Array } | null;
    free(): void;
}

export declare const CALCULATORS: readonly ['official', 'relax', 'akatsuki'];
export declare function route(mode: number, mods: number): 0 | 1 | 2;
export declare const version: string;
export declare const RELAX: 128;
export declare const AUTOPILOT: 8192;
