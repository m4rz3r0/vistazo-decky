import { safe } from "../safe";
import { t } from "../i18n";
declare const collectionStore: any;
declare const appStore: any;
declare const friendStore: any;
declare const SteamClient: any;
declare const LocalizationManager: any;

export interface Game {
  appid: number;
  name: string;
  steam: boolean; // false: RomM game handled by Tender
  platform: string | null;
  minutes: number;
  lastPlayed: number; // unix seconds, 0 = never
}

export type ShelfId = "installed" | "retro";
export const SHELVES: { id: ShelfId; label: string }[] = [
  { id: "installed", label: t.installed },
  { id: "retro", label: t.retro },
];

const toGame = (
  o: any,
  steam: boolean,
  platform: string | null = null,
): Game => ({
  appid: o.appid,
  name: String(o.display_name ?? ""),
  steam,
  platform,
  minutes: Math.round(Number(o.minutes_playtime_forever ?? 0) || 0),
  lastPlayed: Math.floor(Number(o.rt_last_time_played ?? 0) || 0),
});

const byRecent = (a: Game, b: Game) =>
  b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name, "es");

export function loadShelf(id: ShelfId): Game[] {
  try {
    if (id === "installed") {
      return (collectionStore.localGamesCollection?.allApps ?? [])
        .filter((o: any) => o.app_type === 1 && !o.BIsShortcut?.())
        .map((o: any) => toGame(o, true))
        .sort(byRecent);
    }
    // Tender keeps one collection per console, named "RomM: <console> (<device>)".
    const seen = new Set<number>();
    const games: Game[] = [];
    for (const c of collectionStore.userCollections ?? []) {
      const m = /^RomM:\s*(.+?)(?:\s*\([^)]*\))?$/.exec(
        String(c.displayName ?? ""),
      );
      if (!m) continue;
      for (const o of c.allApps ?? []) {
        if (seen.has(o.appid)) continue;
        seen.add(o.appid);
        games.push(toGame(o, false, m[1]));
      }
    }
    return games.sort(byRecent);
  } catch {
    return [];
  }
}

// Images: the user's own custom art first, then Steam's cache, then the CDN.
const custom = (kind: string, o: any): string[] => safe(() => appStore[kind](o), []);
const cdn = (id: number, file: string) =>
  `https://shared.steamstatic.com/store_item_assets/steam/apps/${id}/${file}`;

export function portraitUrls(g: Game): string[] {
  const o = appStore.GetAppOverviewByAppID(g.appid);
  const list = [...custom("GetCustomVerticalCapsuleURLs", o)];
  if (g.steam) {
    list.push(...safe(() => appStore.GetCachedVerticalCapsuleURL(o), []));
    list.push(cdn(g.appid, "library_600x900.jpg"));
  }
  return list;
}

function steamArt(g: Game, kind: string, file: string): string[] {
  const list = [...custom(kind, appStore.GetAppOverviewByAppID(g.appid))];
  if (g.steam)
    list.push(`/assets/${g.appid}/${file}`, `/assets/${g.appid}_${file}`, cdn(g.appid, file));
  return list;
}

export const heroUrls = (g: Game) => steamArt(g, "GetCustomHeroImageURLs", "library_hero.jpg");
export const logoUrls = (g: Game) => steamArt(g, "GetCustomLogoImageURLs", "logo.png");

export function launch(g: Game) {
  SteamClient.Apps.RunGame(String(g.appid), "", -1, 100);
}

// ---------- Friends and own status ----------

export interface StatusOption {
  id: string;
  label: string;
  tone: string; // colour of the solid status dot
}

const loc = (token: string, fallback: string) => {
  const s = safe(() => LocalizationManager.LocalizeString(token), "");
  return typeof s === "string" && s && !s.startsWith("#") ? s : fallback;
};

export function statusOptions(): StatusOption[] {
  return [
    {
      id: "online",
      label: loc("#PersonaStateOnline", t.online),
      tone: "#5fc97e", // green, not lime: lime only marks focus and selection
    },
    { id: "away", label: loc("#PersonaStateAway", t.away), tone: "#f2c94c" },
    { id: "dnd", label: t.doNotDisturb, tone: "#ff6b5b" },
    {
      id: "invisible",
      label: loc("#PersonaStateInvisible", t.invisible),
      tone: "#8a8a8a",
    },
    {
      id: "offline",
      label: loc("#PersonaStateOffline", t.offline),
      tone: "#3d3d3d",
    },
  ];
}

const STATE_OF: Record<string, number> = {
  online: 1,
  away: 3,
  invisible: 7,
  offline: 0,
};

const ui = () => friendStore?.m_FriendsUIFriendStore;

export function currentStatus(): string {
  const f = ui();
  if (!f) return "offline";
  if (safe(() => f.GetUserDoNotDisturb(), false)) return "dnd";
  const s = Number(
    f.m_eUserPersonaState ?? f.self?.persona?.m_ePersonaState ?? 0,
  );
  if (s === 7) return "invisible";
  if (s === 0) return "offline";
  if (s === 3 || s === 4) return "away";
  return "online";
}

export function setStatus(id: string) {
  const f = ui();
  if (!f || typeof f.SetUserPersonaState !== "function") return;
  try {
    if (id === "dnd") {
      if (Number(f.m_eUserPersonaState) !== 1) f.SetUserPersonaState(1);
      f.SetUserDoNotDisturb?.(true);
      return;
    }
    if (f.GetUserDoNotDisturb?.()) f.SetUserDoNotDisturb?.(false);
    f.SetUserPersonaState(STATE_OF[id] ?? 1);
  } catch (e) {
    console.error("[Vistazo] status", e);
  }
}

export const onlineFriends = () => safe(() => Number(ui().GetOnlineFriendCount()) || 0, 0);
