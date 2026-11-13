import { safe } from "../safe";
import { locale, t } from "../i18n";
import { allAddons } from "../addons";
declare const collectionStore: any;
declare const appStore: any;
declare const friendStore: any;
declare const SteamClient: any;
declare const LocalizationManager: any;

export interface Game {
  appid: number;
  name: string;
  steam: boolean; // false: RomM game handled by Tender
  own?: boolean; // a RomM game Vistazo looks after itself (its own entry in Steam)
  platform: string | null;
  minutes: number;
  lastPlayed: number; // unix seconds, 0 = never
}

// A shelf is "installed", "retro" (Tender's RomM collections together) or one of the user's Steam
// collections, by its id. The settings say which ones show, in this order.
export type ShelfId = string;
export interface Shelf {
  id: ShelfId;
  label: string;
}

// The games add-ons keep as their own entries in Steam (RomM games, say).
const ownGames = (): number[] =>
  allAddons().flatMap((a) => {
    try {
      return a.shelf?.() ?? [];
    } catch {
      return [];
    }
  });

// Add-ons' own shelves, each under an id that cannot be taken for a Steam collection's.
const addonShelves = (): { id: string; label: string; apps: number[] }[] =>
  allAddons().flatMap((a) => {
    try {
      return (a.shelves?.() ?? [])
        .filter((s) => s && /^[a-z0-9-]{2,32}$/.test(String(s.id)) && typeof s.label === "string" && Array.isArray(s.apps))
        .map((s) => ({ id: `addon:${a.id}:${s.id}`, label: s.label.slice(0, 30), apps: s.apps.map(Number).filter((n) => n > 0) }));
    } catch {
      return [];
    }
  });

const isRomm = (c: any) => /^RomM:/.test(String(c?.displayName ?? ""));

// Read from this Deck's own Steam collections every time, so each person sees theirs.
export function availableShelves(): Shelf[] {
  const collections: any[] = safe(() => collectionStore.userCollections, []);
  const out: Shelf[] = [{ id: "installed", label: t.installed }];
  // "Retro" only where there are RomM games: Tender's, or the ones an add-on looks after.
  if (collections.some(isRomm) || ownGames().length) out.push({ id: "retro", label: t.retro });
  // Favourites and collections the user made (or a tool such as Steam ROM Manager made for them);
  // Steam's built-in ones (installed, soundtracks, uncategorised…) and Tender's RomM ones are left out.
  // Shelves add-ons bring (cloud games, say), while they have something on them.
  for (const s of addonShelves()) if (s.apps.length) out.push({ id: s.id, label: s.label });
  for (const c of collections) {
    const id = String(c?.id ?? "");
    if ((id === "favorite" || /^(uc|srm)-/.test(id)) && !isRomm(c))
      out.push({ id, label: String(c.displayName ?? id) });
  }
  return out;
}

// The shelves the home shows; never none, so L1/R1 and the row always have something to stand on.
export function activeShelves(enabled: string[]): Shelf[] {
  const all = availableShelves();
  const on = all.filter((s) => enabled.includes(s.id));
  return on.length ? on : all.slice(0, 1);
}

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
  b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name, locale);

// The row shows the most recent games; the rest are one press away in the full library. A cover is
// a node in Steam's navigation tree and an image to decode, so a library of hundreds stays light.
const SHELF_MAX = 60;

const isSteamApp = (o: any) => o.app_type === 1 && !o.BIsShortcut?.();

export function loadShelf(id: ShelfId): Game[] {
  portraits.clear(); // custom art may have changed since the last read
  return readShelf(id).slice(0, SHELF_MAX);
}

function readShelf(id: ShelfId): Game[] {
  try {
    if (id === "installed") {
      return (collectionStore.localGamesCollection?.allApps ?? [])
        .filter(isSteamApp)
        .map((o: any) => toGame(o, true))
        .sort(byRecent);
    }
    if (id.startsWith("addon:")) {
      const shelf = addonShelves().find((s) => s.id === id);
      return (shelf?.apps ?? [])
        .map((appid) => overview(appid))
        .filter(Boolean)
        .map((o: any) => toGame(o, false))
        .sort(byRecent);
    }
    if (id !== "retro") {
      const c = (collectionStore.userCollections ?? []).find((x: any) => x.id === id);
      return (c?.allApps ?? []).map((o: any) => toGame(o, isSteamApp(o))).sort(byRecent);
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
    for (const appid of ownGames()) {
      const o = overview(appid);
      if (o && !seen.has(appid)) games.push({ ...toGame(o, false), own: true });
    }
    return games.sort(byRecent);
  } catch {
    return [];
  }
}

// Images: the user's own custom art first, then Steam's cache, then the CDN.
const overview = (appid: number): any => safe(() => appStore.GetAppOverviewByAppID(appid), null);
const custom = (kind: string, o: any): string[] => safe(() => appStore[kind](o), []);
const cdn = (id: number, file: string) =>
  `https://shared.steamstatic.com/store_item_assets/steam/apps/${id}/${file}`;

// Kept per game until the shelf is read again: the same list (same identity) on every render, so a
// cover that hasn't changed isn't drawn again.
const portraits = new Map<number, string[]>();
export function portraitUrls(g: Game): string[] {
  let list = portraits.get(g.appid);
  if (!list) {
    const o = overview(g.appid);
    list = [...custom("GetCustomVerticalCapsuleURLs", o)];
    if (g.steam) {
      list.push(...safe(() => appStore.GetCachedVerticalCapsuleURL(o), []));
      list.push(cdn(g.appid, "library_600x900.jpg"));
    }
    portraits.set(g.appid, list);
  }
  return list;
}

function steamArt(g: Game, kind: string, file: string): string[] {
  const list = [...custom(kind, overview(g.appid))];
  if (g.steam)
    list.push(`/assets/${g.appid}/${file}`, `/assets/${g.appid}_${file}`, cdn(g.appid, file));
  return list;
}

export const heroUrls = (g: Game) => steamArt(g, "GetCustomHeroImageURLs", "library_hero.jpg");
export const logoUrls = (g: Game) => steamArt(g, "GetCustomLogoImageURLs", "logo.png");

export function launch(g: Game) {
  try {
    SteamClient.Apps.RunGame(String(g.appid), "", -1, 100);
  } catch (e) {
    console.error("[Vistazo] launch", e);
  }
}

// ---------- Friends and own status ----------

export interface StatusOption {
  id: string;
  label: string;
  tone: string; // colour of the solid status dot
}

let translated = true; // false once a label had to fall back to our own text
const loc = (token: string, fallback: string) => {
  const s = safe(() => LocalizationManager.LocalizeString(token), "");
  if (typeof s === "string" && s && !s.startsWith("#")) return s;
  translated = false;
  return fallback;
};

// Kept once built: the labels come from Steam's translations, which don't change while it runs.
// Not kept while Steam's translations aren't ready yet, so its own labels show as soon as they are.
let options: StatusOption[] | null = null;
export function statusOptions(): StatusOption[] {
  if (options) return options;
  translated = true;
  const list: StatusOption[] = [
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
  if (translated) options = list;
  return list;
}

const STATE_OF: Record<string, number> = {
  online: 1,
  away: 3,
  invisible: 7,
  offline: 0,
};

const ui = (): any => safe(() => friendStore.m_FriendsUIFriendStore, null);

export function currentStatus(): string {
  const f = ui();
  if (!f) return "offline";
  if (safe(() => f.GetUserDoNotDisturb(), false)) return "dnd";
  const s = safe(() => Number(f.m_eUserPersonaState ?? f.self?.persona?.m_ePersonaState ?? 0), 0);
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
