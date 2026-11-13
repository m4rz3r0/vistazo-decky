import { callable } from "@decky/api";
import { safe } from "./safe";

// RomM games Vistazo looks after itself (for those who turn it on). While Tender is installed it
// keeps every game it has added to Steam for itself: it stops their launch to run its own checks
// and writes its own launch options back. So Vistazo does not touch those. It makes a second
// entry of its own for a game, which Tender neither knows nor changes, and that one is Vistazo's
// from start to finish: its file comes from RomM with Vistazo's key and it starts through
// Vistazo's launcher. Taking it away removes that entry and only the files Vistazo brought.
declare const SteamClient: any;
declare const appStore: any;

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

// Steam number -> RomM number of the games that are Vistazo's.
const owned = new Map<number, number>();
let loaded: Promise<void> | null = null;
export function loadOwned(): Promise<void> {
  return (loaded ??= list()
    .then((all) => {
      for (const [appid, romId] of Object.entries(all ?? {})) owned.set(Number(appid), Number(romId));
    })
    .catch((e) => {
      loaded = null;
      console.warn("[Vistazo] own games", e);
    }));
}
export const ownedRom = (appid: number) => owned.get(appid) ?? 0;
export const ownedApp = (romId: number) => {
  for (const [appid, rom] of owned) if (rom === romId) return appid;
  return 0;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function untilKnown(appid: number) {
  for (let i = 0; i < 20 && !safe(() => appStore.GetAppOverviewByAppID(appid), null); i++) await wait(100);
}

// Makes Vistazo's own entry for a RomM game and starts bringing its file. Returns why it could
// not, or null when it is under way. Nothing is left in Steam when it fails.
export async function addOwn(romId: number, name: string): Promise<string | null> {
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
  cover(romId)
    .then((c) => c?.ok && SteamClient.Apps.SetCustomArtworkForApp(appid, c.data, c.kind, 0))
    .catch(() => undefined);
  if (!taken.installed) await download(appid).catch(() => null);
  return null;
}

export const retryOwn = (appid: number) => download(appid).catch(() => null);

// Takes Vistazo's entry away: the files Vistazo brought, its record and the Steam entry. A file
// that was already there (another program's) stays.
export async function removeOwn(appid: number): Promise<string | null> {
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
  // The cover Vistazo set goes with the entry.
  safe(() => SteamClient.Apps.ClearCustomArtworkForApp(appid, 0), undefined);
  SteamClient.Apps.RemoveShortcut(appid);
  owned.delete(appid);
  return null;
}
