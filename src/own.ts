import { callable } from "@decky/api";
import { useEffect, useState } from "react";
import { safe } from "./safe";

// RomM games Vistazo looks after itself (for those who turn it on). While Tender is installed it
// keeps every game it has added to Steam for itself: it stops their launch to run its own checks
// and writes its own launch options back. So Vistazo does not touch those. It makes a second
// entry of its own for a game, which Tender neither knows nor changes, and that one is Vistazo's
// from start to finish: its file comes from RomM with Vistazo's key and it starts through
// Vistazo's launcher. Taking it away removes that entry and only the files Vistazo brought.
declare const SteamClient: any;
declare const appStore: any;
declare const SteamUIStore: any;

export interface GameState {
  ok?: boolean;
  why?: string;
  managed: boolean;
  rom_id: number;
  installed: boolean;
  removable: boolean;
  options?: string;
  job?: { state: string; done: number; total: number };
}
type Reply = { ok: boolean; why?: string };

const list = callable<[], Record<string, number>>("game_list");
const launcher = callable<[], Reply & { exe: string; start_dir: string }>("game_launcher");
const cover = callable<[romId: number], Reply & { data: string; kind: string }>("game_cover");
const take = callable<[appid: number, romId: number, exe: string, dir: string, options: string], GameState>("game_take");
const release = callable<[appid: number], Reply>("game_release");
const download = callable<[appid: number], GameState>("game_download");
const cancel = callable<[appid: number], GameState>("game_cancel");
const remove = callable<[appid: number], GameState>("game_remove");
export const gameState = callable<[appid: number], GameState>("game_state");

// Steam number -> RomM number of the games that are Vistazo's. The backend's record is the truth;
// this copy is read from it and told about every change, so whatever shows a game follows it.
const owned = new Map<number, number>();
const watchers = new Set<() => void>();
const changed = () => watchers.forEach((fn) => fn());
let loaded: Promise<void> | null = null;
export function loadOwned(again = false): Promise<void> {
  if (again) loaded = null;
  return (loaded ??= list()
    .then((all) => {
      owned.clear();
      for (const [appid, romId] of Object.entries(all ?? {})) owned.set(Number(appid), Number(romId));
      changed();
    })
    .catch((e) => {
      loaded = null;
      console.warn("[Vistazo] own games", e);
    }));
}
export const ownedRom = (appid: number) => owned.get(appid) ?? 0;
export const ownedApps = () => [...owned.keys()];
// The RomM game behind a Steam entry, 0 when it is not Vistazo's. A Steam entry this copy does
// not know is asked about once more: it may have been made a moment ago.
const asked = new Set<number>();
// Tells a page that something about Vistazo's games changed (one was closed, added or removed).
export function useOwnChanges(fn: () => void) {
  useEffect(() => {
    watchers.add(fn);
    return () => {
      watchers.delete(fn);
    };
  }, [fn]);
}
export function useOwnedRom(appid: number): number {
  const [romId, set] = useState(ownedRom(appid));
  useEffect(() => {
    const read = () => set(ownedRom(appid));
    watchers.add(read);
    read();
    if (appid > 0 && !ownedRom(appid) && !asked.has(appid)) {
      asked.add(appid);
      loadOwned(true);
    }
    return () => {
      watchers.delete(read);
    };
  }, [appid]);
  return romId;
}
export const ownedApp = (romId: number) => {
  for (const [appid, rom] of owned) if (rom === romId) return appid;
  return 0;
};

// One of Vistazo's games was closed: its page asks RomM to read its achievements again the next
// time it shows (it is usually not on screen at that moment).
const played = new Set<number>();
export const takePlayed = (appid: number) => played.delete(appid);
export function watchOwnGames(): () => void {
  const reg = safe(
    () =>
      SteamClient.GameSessions.RegisterForAppLifetimeNotifications((u: any) => {
        const appid = Number(u?.unAppID);
        if (u && u.bRunning === false && owned.has(appid)) {
          played.add(appid);
          changed();
        }
      }),
    null as any,
  );
  return () => safe(() => reg?.unregister(), undefined);
}
const isRunning = (appid: number) =>
  safe(() => (SteamUIStore.RunningApps as any[]).some((a) => Number(a.appid) === appid), false);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function untilKnown(appid: number) {
  for (let i = 0; i < 20 && !safe(() => appStore.GetAppOverviewByAppID(appid), null); i++) await wait(100);
}

// The pictures Steam shows for an entry, by Steam's own numbers: cover, wide picture behind the
// page, and logo.
const COVER = 0;
const ART: [number, string][] = [
  [1, "GetCustomHeroImageURLs"],
  [2, "GetCustomLogoImageURLs"],
];

// One of an entry's pictures as Steam wants it handed over: [base64, kind], or null.
async function picture(urls: string[]): Promise<[string, string] | null> {
  for (const url of urls) {
    try {
      const blob = await (await fetch(url)).blob();
      const kind = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "";
      if (!kind || blob.size > 8 * 1024 * 1024) continue;
      const data = await new Promise<string>((done, fail) => {
        const reader = new FileReader();
        reader.onload = () => done(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => fail(reader.error);
        reader.readAsDataURL(blob);
      });
      if (data) return [data, kind];
    } catch {
      /* the next one */
    }
  }
  return null;
}

// The new entry looks like the one it comes from: the wide picture and the logo are copied from
// it (they are on the Deck already); the cover comes from RomM.
async function dress(appid: number, romId: number, from: number) {
  const source = safe(() => appStore.GetAppOverviewByAppID(from), null);
  for (const [type, method] of source ? ART : []) {
    const got = await picture(safe(() => appStore[method](source) as string[], []));
    if (got) safe(() => SteamClient.Apps.SetCustomArtworkForApp(appid, got[0], got[1], type), undefined);
  }
  const c = await cover(romId).catch(() => null);
  if (c?.ok) safe(() => SteamClient.Apps.SetCustomArtworkForApp(appid, c.data, c.kind, COVER), undefined);
}

// Makes Vistazo's own entry for a RomM game and starts bringing its file. `from` is the Steam
// entry it was asked from (Tender's). Returns why it could not, or null when it is under way.
// Nothing is left in Steam when it fails.
export async function addOwn(romId: number, name: string, from = 0): Promise<string | null> {
  await loadOwned();
  if (ownedApp(romId)) return null;
  const l = await launcher();
  if (!l.ok) return l.why ?? "error";
  // Steam takes little from this call: the name, the program and its folder are set after it.
  const appid = Number(await SteamClient.Apps.AddShortcut(name, l.exe, "", "")) || 0;
  if (!appid) return "steam";
  await untilKnown(appid);
  SteamClient.Apps.SetShortcutName(appid, name);
  SteamClient.Apps.SetShortcutExe(appid, l.exe);
  SteamClient.Apps.SetShortcutStartDir(appid, l.start_dir);
  const taken = await take(appid, romId, "", "", "").catch(() => null);
  if (!taken?.ok || !taken.options) {
    SteamClient.Apps.RemoveShortcut(appid);
    return taken?.why ?? "error";
  }
  // All Steam is told about the game: its number in RomM.
  SteamClient.Apps.SetAppLaunchOptions(appid, taken.options);
  owned.set(appid, romId);
  changed();
  dress(appid, romId, from).catch((e) => console.warn("[Vistazo] pictures", e));
  if (!taken.installed) await download(appid).catch(() => null);
  return null;
}

export const retryOwn = (appid: number) => download(appid).catch(() => null);
export const cancelOwn = (appid: number) => cancel(appid).catch(() => null);

// Takes Vistazo's entry away: the files Vistazo brought, its record and the Steam entry. A file
// that was already there (another program's) stays.
export async function removeOwn(appid: number): Promise<string | null> {
  // Never from under a game that is being played.
  if (isRunning(appid)) return "running";
  let state = await cancel(appid).catch(() => null);
  for (let i = 0; i < 50 && state?.job?.state === "downloading"; i++) {
    await wait(100);
    state = await gameState(appid).catch(() => null);
  }
  if (state?.removable) {
    const gone = await remove(appid).catch(() => null);
    if (!gone?.ok) return gone?.why ?? "error";
  }
  const freed = await release(appid).catch(() => null);
  if (!freed?.ok && freed?.why !== "game") return freed?.why ?? "error";
  // The pictures Vistazo set go with the entry.
  for (const type of [COVER, ...ART.map(([n]) => n)])
    safe(() => SteamClient.Apps.ClearCustomArtworkForApp(appid, type), undefined);
  SteamClient.Apps.RemoveShortcut(appid);
  owned.delete(appid);
  asked.delete(appid);
  changed();
  return null;
}
