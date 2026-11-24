/**
 * osu!somtum additions to tosu: our own stable build (Somtum.Client) and our pp.
 *
 * Somtum.Client is osu!stable recompiled for osu!somtum, shipped as `somtum-stable.exe` in two
 * streams (stable40, cuttingedge). It is the same game underneath, so the stable reader works on
 * it; three things differ:
 *  - the process name;
 *  - a few methods JIT to different machine code, so four of the stable signatures need our own
 *    (SOMTUM_STABLE_PATTERNS, checked on b20261118.1 stable40 and b20261118 cuttingedge);
 *  - the exe may live outside the osu! folder (resolveSomtumDataDir).
 */
import { wLogger } from '@tosu/common';
import fs from 'node:fs';
import path from 'node:path';
import type { Process } from 'tsprocess';

import type { ScanPatterns } from '@/memory/types';

export const SOMTUM_STABLE_EXE = 'somtum-stable.exe';

/** Exact exe name on Windows; on Linux (Wine) /proc/<pid>/comm is cut to 15 chars, and tsprocess
 * matches by substring there, so "somtum-stable" catches "somtum-stable.e". */
export const SOMTUM_STABLE_PROCESS_NAMES =
    process.platform === 'win32' ? [SOMTUM_STABLE_EXE] : ['somtum-stable'];

export function isSomtumStable(process: Process): boolean {
    try {
        const name =
            globalThis.process.platform === 'win32'
                ? process.getProcessPath()
                : process.getProcessCommandLine();
        return name.toLowerCase().includes(SOMTUM_STABLE_EXE);
    } catch {
        return false;
    }
}

/**
 * Signatures that differ in Somtum.Client. Each resolves to the same address the stable one
 * does (the code reading it differs, not the data), so the readers stay untouched:
 *  - playTimeAddr: [[p + 0x5]] = AudioEngine.Time
 *  - skinDataAddr: [[p + 0x7]] = SkinManager.Current
 *  - bindingsAddr: [[p]] = BindingManager's Dictionary<Bindings, Keys>
 *  - gameTimePtr: [[p]] = GameBase.Time
 * All four are JIT-compiled by the time the main menu shows.
 */
export const SOMTUM_STABLE_PATTERNS: Partial<ScanPatterns> = {
    playTimeAddr: {
        // ret; mov eax,[esi+4]; mov edx,[AudioEngine.Time]; mov [eax+4],edx
        pattern: 'C3 8B 46 04 8B 15 ?? ?? ?? ?? 89 50 04',
        offset: 0x1
    },
    skinDataAddr: {
        // je; test edi,edi; jne; mov esi,[SkinManager.Current]; mov eax,[...CurrentUserSkin]
        pattern: '74 ?? 85 FF 75 ?? 8B 35 ?? ?? ?? ?? A1',
        offset: 0x1
    },
    bindingsAddr: {
        // xor edx,edx; mov [ebp-?],edx; mov edx,[BindingManager.BindingDictionary]; cmp [edx],al
        pattern: '33 D2 89 55 ?? 8B 15 ?? ?? ?? ?? 38 02 8D 7D',
        offset: 0x7
    },
    gameTimePtr: {
        // mov eax,[GameBase.Time]; mov [edx+4],eax; call
        pattern: 'A1 ?? ?? ?? ?? 89 42 04 E8',
        offset: 0x1
    }
};

/** baseAddr - this = the address of Player.mode (the ruleset; RetryCount +0x8, PlayCount +0xc).
 * Stable reads it 0x33 back; in our build that byte is inside `cmp [GameBase.Mode],2` (screen
 * state, not ruleset), and Player.mode is the `cmp [Player.mode],1` operand 0x2D back. */
export const SOMTUM_GAMEMODE_BASE_OFFSET = 0x2d;

function isOsuDir(dir: string): boolean {
    try {
        return (
            fs.existsSync(path.join(dir, 'osu!.db')) ||
            fs.existsSync(path.join(dir, 'Songs'))
        );
    } catch {
        return false;
    }
}

/** A Windows path from the game (under Wine on Linux) as a path we can open. */
function hostPath(winPath: string): string {
    if (globalThis.process.platform === 'win32') return winPath;
    // Z: is Wine's root by default; other drive letters live in the prefix's dosdevices.
    const m = /^([A-Za-z]):[\\/](.*)$/.exec(winPath.trim());
    if (!m) return winPath;
    const rest = m[2].replace(/\\/g, '/');
    if (m[1].toLowerCase() === 'z') return '/' + rest;
    const prefix =
        globalThis.process.env.WINEPREFIX ||
        path.join(globalThis.process.env.HOME || '', '.wine');
    return path.join(prefix, 'dosdevices', `${m[1].toLowerCase()}:`, rest);
}

/**
 * Where Somtum.Client keeps the player's osu! data, found the way the client finds it
 * (OsuStablePlatform.PlatformBridge.ResolveOsuDataDir): SOMTUM_OSU_DIR in its environment (the
 * launcher sets it), then "osu_dir" in somtum-stable.json beside the exe, then the exe folder.
 */
export function resolveSomtumDataDir(proc: Process, exeDir: string): string {
    const tried: string[] = [];
    try {
        const env = proc.getProcessEnv('SOMTUM_OSU_DIR');
        if (env) {
            const dir = hostPath(env);
            tried.push(dir);
            if (isOsuDir(dir)) {
                wLogger.info(
                    `Somtum.Client data folder from %SOMTUM_OSU_DIR%: ${dir}`
                );
                return dir;
            }
        }
    } catch (exc) {
        wLogger.debug('Somtum.Client: reading SOMTUM_OSU_DIR failed', exc);
    }

    try {
        const cfg = path.join(exeDir, 'somtum-stable.json');
        if (fs.existsSync(cfg)) {
            const osuDir = JSON.parse(fs.readFileSync(cfg, 'utf8'))?.osu_dir;
            if (typeof osuDir === 'string' && osuDir !== '') {
                const dir = hostPath(osuDir);
                tried.push(dir);
                if (isOsuDir(dir)) {
                    wLogger.info(
                        `Somtum.Client data folder from %somtum-stable.json%: ${dir}`
                    );
                    return dir;
                }
            }
        }
    } catch (exc) {
        wLogger.debug('Somtum.Client: reading somtum-stable.json failed', exc);
    }

    if (tried.length > 0) {
        wLogger.warn(
            `Somtum.Client: no osu! folder at ${tried.join(', ')}; using the exe folder ${exeDir}`
        );
    }
    return exeDir;
}
