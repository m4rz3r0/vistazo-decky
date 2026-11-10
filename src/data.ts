import { safe } from "./safe";
import { t } from "./i18n";
import { fetchNoCors } from "@decky/api";
import { isUnloaded } from "./lifecycle";

declare const appStore: any;
declare const appDetailsStore: any;
declare const SteamClient: any;

export interface Achievement {
  id: string;
  name: string;
  description: string;
  image: string;
  achieved: boolean;
  hidden: boolean;
  globalPercent: number;
  progress: number | null; // 0..1 when the game reports partial progress
}

export interface AchievementSummary {
  total: number;
  achieved: number;
  next: Achievement[];
  rarest: Achievement | null; // of the ones earned, the one fewest players have
}

export interface GameFacts {
  tags: string[];
  year: string | null;
  sizeBytes: number;
  deckCompat: number; // 0 unknown, 1 unsupported, 2 playable, 3 verified
  minutesTwoWeeks: number;
  snippet: string;
}

export function getFacts(appid: number): GameFacts | null {
  const o: any = safe(() => appStore.GetAppOverviewByAppID(appid), null);
  if (!o) return null;
  const tags: string[] = safe(
    () =>
      (o.store_tag ?? [])
        .slice(0, 2)
        .map((t: number) => appStore.GetLocalizationForStoreTag(t))
        .filter((t: unknown) => typeof t === "string" && t.length > 0),
    [],
  );
  const y = safe(() => String(o.GetCanonicalReleaseYear?.() ?? ""), "");
  const year = y && y !== "0" ? y : null;
  const snippet: string = safe(() => appDetailsStore.GetDescriptions(appid).strSnippet, "");
  return {
    tags,
    year,
    sizeBytes: Number(o.size_on_disk ?? 0) || 0,
    deckCompat: Number(o.steam_deck_compat_category ?? 0) || 0,
    minutesTwoWeeks: Number(o.minutes_playtime_last_two_weeks ?? 0) || 0,
    snippet,
  };
}

const achCache = new Map<number, AchievementSummary | null>();

// Achievement counts kept on the Deck between sessions, so the home shows them the moment a cover
// is selected. They only change while playing: they are refreshed when a game closes, when a game
// page reads its achievements, and in the background for games not seen yet or not read for a day.
export interface AchievementCount {
  achieved: number;
  total: number; // 0: the game has no achievements
  savedAt: number; // ms
}
const COUNTS_KEY = "vistazo:achievement-counts";
let counts: Record<string, [number, number, number]> | null = null;
function countStore() {
  if (counts) return counts;
  counts = {};
  try {
    // Only what we wrote ourselves: anything else in there (an edited or damaged value) is dropped.
    const stored = JSON.parse(localStorage.getItem(COUNTS_KEY) ?? "{}");
    if (stored && typeof stored === "object" && !Array.isArray(stored))
      for (const [id, c] of Object.entries(stored))
        if (/^\d+$/.test(id) && Array.isArray(c) && c.length === 3 && c.every((n) => Number.isFinite(n)))
          counts[id] = c as [number, number, number];
  } catch {
    /* unreadable: start empty */
  }
  return counts;
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveCount(appid: number, achieved: number, total: number) {
  countStore()[appid] = [achieved, total, Date.now()];
  // One write for a burst of updates (the background fill reads many games in a row).
  if (!saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        localStorage.setItem(COUNTS_KEY, JSON.stringify(counts));
      } catch {
        /* storage full or unavailable: counts stay for this session */
      }
    }, 1000);
}
export function savedCount(appid: number): AchievementCount | null {
  const c = countStore()[appid];
  return c ? { achieved: c[0], total: c[1], savedAt: c[2] } : null;
}
export const DAY = 24 * 60 * 60 * 1000;

// Medals: how far a game's achievements have got, the same ladder on the home and the game page.
// A third, two thirds, almost all, all of them.
export type Medal = "bronze" | "silver" | "gold" | "platinum";
export function medal(achieved: number, total: number): Medal | null {
  if (!total || achieved <= 0) return null;
  if (achieved >= total) return "platinum";
  const share = achieved / total;
  return share < 1 / 3 ? "bronze" : share < 2 / 3 ? "silver" : "gold";
}

// Non-Steam shortcuts (Tender's RomM games among them) have the high bit of their app id set.
export const isShortcut = (appid: number) => appid >= 0x80000000;

// RetroAchievements of a RomM game, through Tender: it knows which RomM game a shortcut is, and RomM
// keeps the player's progress once their RetroAchievements username is in their RomM profile.
declare const DeckyBackend: any;
const tender = (method: string, ...args: unknown[]): Promise<any> =>
  DeckyBackend.call("loader/call_plugin_method", "Tender", method, ...args);
let retroPauseUntil = 0;
const RETRO_PAUSE = 2 * 60 * 1000;
const TENDER_PAUSE = 10 * 60 * 1000;
async function loadRetroCount(appid: number): Promise<void> {
  if (Date.now() < retroPauseUntil) return;
  try {
    const game = await tender("get_cached_game_detail", appid);
    if (!game?.rom_id) return;
    const p = await tender("get_achievement_progress", game.rom_id);
    if (p?.success) saveCount(appid, Number(p.earned) || 0, Number(p.total) || 0);
    // RomM didn't answer. An on-demand RomM still waking up answers 503, which Tender also reports
    // as "no RetroAchievements username", so no failure is final: pause, then ask again.
    else retroPauseUntil = Date.now() + RETRO_PAUSE;
  } catch {
    // Tender isn't installed, or hasn't loaded yet (after boot it may start after Vistazo): ask
    // again later instead of giving up for the session.
    retroPauseUntil = Date.now() + TENDER_PAUSE;
  }
}

// Refreshes the saved count of any game: Steam's own achievements, or RetroAchievements for RomM.
export function loadCount(appid: number): Promise<unknown> {
  return isShortcut(appid) ? loadRetroCount(appid) : loadAchievements(appid);
}

export function cachedAchievements(appid: number) {
  return achCache.get(appid);
}

// null: the game has no achievements; undefined: they couldn't be read this time (try again later).
// The game page, the home and the background fill may ask for the same game at once: one read.
const reading = new Map<number, Promise<AchievementSummary | null | undefined>>();
export function loadAchievements(appid: number): Promise<AchievementSummary | null | undefined> {
  let p = reading.get(appid);
  if (!p) {
    p = readAchievements(appid).finally(() => reading.delete(appid));
    reading.set(appid, p);
  }
  return p;
}

// A read Steam never answers must not hold the shared read above for the rest of the session.
const READ_TIMEOUT = 15000;
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

async function readAchievements(appid: number): Promise<AchievementSummary | null | undefined> {
  try {
    const res: any = await withTimeout(
      SteamClient.Apps.GetMyAchievementsForApp(String(appid)),
      READ_TIMEOUT,
    );
    const list: any[] = res?.data?.rgAchievements ?? [];
    if (!list.length) {
      achCache.set(appid, null);
      saveCount(appid, 0, 0);
      return null;
    }
    const all: Achievement[] = list.map((a) => {
      const min = Number(a.flMinProgress) || 0;
      const max = Number(a.flMaxProgress) || 0;
      const cur = Number(a.flCurrentProgress) || 0;
      const hidden = !!a.bHidden && !a.bAchieved;
      return {
        id: String(a.strID),
        name: hidden ? t.hiddenAchievement : String(a.strName ?? ""),
        description: hidden ? t.hiddenAchievementDesc : String(a.strDescription ?? ""),
        image: String(a.strImage ?? ""),
        achieved: !!a.bAchieved,
        hidden,
        globalPercent: Number(a.flAchieved) || 0,
        progress:
          max > min
            ? Math.min(1, Math.max(0, (cur - min) / (max - min)))
            : null,
      };
    });
    const pending = all.filter((a) => !a.achieved);
    // Next = visible ones with partial progress first (closest to done), then the most common among players.
    // Hidden ones last: "Logro oculto" tells the player nothing about what to do next.
    pending.sort((a, b) => {
      if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
      const pa = a.progress ?? -1;
      const pb = b.progress ?? -1;
      if (pa > 0 || pb > 0) return pb - pa;
      return b.globalPercent - a.globalPercent;
    });
    const rarest = all
      .filter((a) => a.achieved && a.globalPercent > 0)
      .reduce<Achievement | null>((r, a) => (!r || a.globalPercent < r.globalPercent ? a : r), null);
    const summary = {
      total: all.length,
      achieved: all.length - pending.length,
      next: pending.slice(0, 3),
      rarest,
    };
    achCache.set(appid, summary);
    saveCount(appid, summary.achieved, summary.total);
    return summary;
  } catch {
    return undefined;
  }
}

const TIERS = ["platinum", "gold", "silver", "bronze", "borked", "pending", "native"] as const;
export type ProtonTier = (typeof TIERS)[number];
const protonCache = new Map<number, ProtonTier | null>();

export function cachedProton(appid: number) {
  return protonCache.get(appid);
}

export async function loadProton(appid: number): Promise<ProtonTier | null> {
  try {
    const r = await fetchNoCors(
      `https://www.protondb.com/api/v1/reports/summaries/${appid}.json`,
      { method: "GET" },
    );
    if (!r.ok) {
      // 404: ProtonDB has no reports for this game. Anything else (busy, down) is worth asking
      // again the next time the page opens.
      if (r.status === 404) protonCache.set(appid, null);
      return null;
    }
    const j = await r.json();
    const tier = (TIERS as readonly unknown[]).includes(j?.tier) ? (j.tier as ProtonTier) : null;
    protonCache.set(appid, tier);
    return tier;
  } catch {
    return null;
  }
}

// A game just started. Steam's own Play button moves Steam's window to its empty "game running"
// page; a game started by a plugin (Tender's Play button, Vistazo's home) relies on Steam making that
// move by itself, and sometimes it never does. Steam's window then stays on the game's page, hidden
// behind the game, and the volume bar or a notification shows that whole page over the game.
// Make the move the Play button makes, once Steam lists the game as running: on that page with no
// game running, Steam goes straight back.
declare const SteamUIStore: any;
export const runningAppIds = (): Set<number> =>
  safe(() => new Set<number>(SteamUIStore.RunningApps.map((a: any) => Number(a.appid))), new Set<number>());

const awaited = new Set<number>(); // Steam may announce one launch more than once: one wait per game
function showRunningGame(appid: number): void {
  if (awaited.has(appid)) return;
  awaited.add(appid);
  let tries = 40;
  const check = () => {
    if (isUnloaded() || tries-- <= 0) return void awaited.delete(appid);
    if (!runningAppIds().has(appid)) return void setTimeout(check, 250);
    awaited.delete(appid);
    safe(() => SteamUIStore.NavigateToRunningApp(), undefined);
  };
  check();
}

// Games starting and closing. A closed game may have new achievements, which Steam writes a moment
// after exit.
export function watchGames(): () => void {
  const reg = safe(
    () =>
      SteamClient.GameSessions.RegisterForAppLifetimeNotifications((n: any) => {
        if (!n?.unAppID) return;
        if (n.bRunning) {
          showRunningGame(n.unAppID);
          return;
        }
        achCache.delete(n.unAppID);
        // Tender syncs RetroAchievements from RomM after the session, which takes a little longer.
        setTimeout(() => loadCount(n.unAppID), isShortcut(n.unAppID) ? 20000 : 5000);
      }),
    null as any,
  );
  return () => safe(() => reg?.unregister(), undefined);
}
