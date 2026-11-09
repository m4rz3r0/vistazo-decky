import { safe } from "./safe";
import { t } from "./i18n";
import { fetchNoCors } from "@decky/api";

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
  const o = appStore?.GetAppOverviewByAppID?.(appid);
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
  try {
    counts = JSON.parse(localStorage.getItem(COUNTS_KEY) ?? "{}") ?? {};
  } catch {
    counts = {};
  }
  return counts!;
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveCount(appid: number, summary: AchievementSummary | null) {
  countStore()[appid] = [summary?.achieved ?? 0, summary?.total ?? 0, Date.now()];
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

export function cachedAchievements(appid: number) {
  return achCache.get(appid);
}

// null: the game has no achievements; undefined: they couldn't be read this time (try again later).
export async function loadAchievements(
  appid: number,
): Promise<AchievementSummary | null | undefined> {
  try {
    const res = await SteamClient.Apps.GetMyAchievementsForApp(String(appid));
    const list: any[] = res?.data?.rgAchievements ?? [];
    if (!list.length) {
      achCache.set(appid, null);
      saveCount(appid, null);
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
    const summary = {
      total: all.length,
      achieved: all.length - pending.length,
      next: pending.slice(0, 3),
    };
    achCache.set(appid, summary);
    saveCount(appid, summary);
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
      protonCache.set(appid, null);
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

// A game just closed: its achievements may have changed. Steam writes them a moment after exit.
export function watchGameExits(): () => void {
  const reg = safe(
    () =>
      SteamClient.GameSessions.RegisterForAppLifetimeNotifications((n: any) => {
        if (n?.bRunning === false && n.unAppID) {
          achCache.delete(n.unAppID);
          setTimeout(() => loadAchievements(n.unAppID), 5000);
        }
      }),
    null as any,
  );
  return () => safe(() => reg?.unregister(), undefined);
}
