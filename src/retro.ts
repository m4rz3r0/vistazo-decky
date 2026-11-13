import { appDetailsClasses } from "@decky/ui";
import { medal } from "./data";
import { locale, num, t } from "./i18n";
import { isUnloaded } from "./lifecycle";
import { fitPanel } from "./Panel";
import { safe } from "./safe";
import { inSpanish, keepTranslated, restoreText, wordInSpanish } from "./retroText";
import { isLinked, rommProgress, rommStatus } from "./romm";
import { settings } from "./settings";
import { pageCss } from "./styles";

// The page of a RomM game. Tender (another plugin) owns that page: it replaces Steam's play row and
// adds its tabs (game info, achievements, saves, BIOS). Vistazo leaves all of that working and only
// adds, between Tender's play row and its tabs, the same first screen a Steam game gets: the
// achievements and what comes next on the left, the game on the right. The page is that one
// screen: Tender's tabs become a row of buttons at its bottom (description, achievements, saves,
// BIOS) and what each one holds opens over the page, like a dialog, instead of further down.
//
// It is plain DOM placed next to Tender's own nodes, not a React patch: two plugins rewriting the
// same React tree is where pages break. The buttons and what they open are Tender's own elements,
// only placed and dressed differently, so everything in them keeps working (syncing a save,
// downloading a BIOS). All the data comes from Tender.
declare const DeckyBackend: any;
declare const SteamUIStore: any;
declare const appStore: any;
declare const SteamClient: any;

const tender = (method: string, ...args: unknown[]): Promise<any> =>
  DeckyBackend.call("loader/call_plugin_method", "Tender", method, ...args);

interface Next {
  title: string;
  badge: string;
  awarded: number;
}
interface Retro {
  platform: string;
  year: string;
  genres: string[];
  rating: number;
  summary: string;
  save: "synced" | "conflict" | null;
  bios: "ok" | "missing" | null;
  earned: number;
  total: number;
  hardcore: number;
  next: Next[] | null; // null: not read yet
  raId: number; // 0: no achievements
  retryAt?: number; // the slower reads did not get through: read again after this time
}

const cache = new Map<number, Retro | null>();
// After RomM fails to answer, no more reads through it for a while.
// Games Tender has nothing for (or could not answer about): its own page is left as it is.
const unavailable = new Set<number>();
const QUIET = 2 * 60 * 1000;
let quietUntil = 0;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

// What RomM said right after a game was closed, newer than what Tender keeps (Tender holds its
// reading for an hour). It wins over Tender's until Steam restarts.
interface Fresh {
  ids: Set<string>;
  hardcoreIds: Set<string>;
  earned: number;
  hardcore: number;
  total: number;
}
const fresh = new Map<number, Fresh>();
// The game's achievement list as Tender gave it, to work out the next ones again.
const lists = new Map<number, any[]>();

function nextOf(list: any[], got: Set<string>): Next[] {
  // The ones most players have come first: they are the nearest.
  return list
    .filter((a: any) => !got.has(String(a.badge_id)))
    .sort((a: any, b2: any) => (Number(b2.num_awarded) || 0) - (Number(a.num_awarded) || 0))
    .slice(0, 3)
    .map((a: any) => ({
      title: String(a.title ?? ""),
      badge: String(a.badge_url_lock ?? a.badge_url ?? ""),
      awarded: Number(a.num_awarded) || 0,
    }));
}

function applyFresh(appid: number, retro: Retro) {
  const f = fresh.get(appid);
  if (!f) return;
  // Tender caught up (or got further): its figures are the newer ones from now on.
  if (retro.earned > f.earned) {
    fresh.delete(appid);
    return;
  }
  retro.earned = f.earned;
  retro.hardcore = f.hardcore;
  if (f.total) retro.total = f.total;
  const list = lists.get(appid);
  if (list) retro.next = nextOf(list, f.ids);
}

async function load(appid: number): Promise<void> {
  try {
    const g = await tender("get_cached_game_detail", appid);
    if (!g?.found || !g.rom_id) {
      cache.set(appid, null);
      unavailable.add(appid);
      changed();
      return;
    }
    unavailable.delete(appid);
    const before = cache.get(appid);
    const meta = g.metadata ?? {};
    const sum = g.achievement_summary ?? {};
    const status = String(g.save_sync_display?.status ?? "");
    const date = Number(meta.first_release_date) || 0;
    const retro: Retro = {
      platform: String(g.platform_name ?? ""),
      year: date ? String(new Date(date * 1000).getUTCFullYear()) : "",
      genres: (Array.isArray(meta.genres) ? meta.genres : []).slice(0, 2).map(String),
      rating: Number(meta.average_rating) || 0,
      summary: String(meta.summary ?? ""),
      save: !g.save_sync_enabled ? null : status === "synced" ? "synced" : /conflict/.test(status) ? "conflict" : null,
      bios: g.bios_level === "ok" ? "ok" : g.bios_level ? "missing" : null,
      earned: Number(sum.earned) || 0,
      total: Number(sum.total) || 0,
      hardcore: Number(sum.earned_hardcore) || 0,
      // Read again after a game: what was shown stays until the new list is in.
      next: before?.next ?? null,
      raId: Number(g.ra_id) || 0,
    };
    applyFresh(appid, retro);
    cache.set(appid, retro);
    changed();
    // The slower reads fill in afterwards: which achievements are left, and the BIOS when Tender
    // had not looked yet. They go through RomM, one at a time and never while it is not answering
    // (an on-demand RomM takes a while to wake up): Tender needs its own calls to get through,
    // the play button's among them.
    let progress: any = null;
    let list: any = null;
    let bios: any = null;
    if (Date.now() >= quietUntil) {
      if (g.ra_id) progress = await tender("get_achievement_progress", g.rom_id).catch(() => null);
      if (g.ra_id && !progress?.success) {
        quietUntil = Date.now() + QUIET;
        retro.retryAt = quietUntil;
      } else {
        if (g.ra_id) list = await tender("get_achievements", g.rom_id).catch(() => null);
        if (!g.bios_level) bios = await tender("get_bios_status", g.rom_id).catch(() => null);
      }
    } else {
      retro.retryAt = quietUntil;
    }
    const b = bios?.bios_status;
    if (b?.needs_bios) retro.bios = b.bios_level === "ok" ? "ok" : "missing";
    if (progress?.success) {
      retro.earned = Number(progress.earned) || 0;
      retro.total = Number(progress.total) || 0;
      retro.hardcore = Number(progress.earned_hardcore) || 0;
    }
    if (Array.isArray(list?.achievements) && progress?.success) {
      lists.set(appid, list.achievements);
      const got = new Set<string>((progress.earned_achievements ?? []).map((e: any) => String(e.id)));
      retro.next = nextOf(list.achievements, got);
    } else if (retro.next === null) {
      retro.next = [];
    }
    applyFresh(appid, retro);
    changed();
  } catch {
    // Tender missing or not ready: asked again in a while, not on every look.
    unavailable.add(appid);
    changed();
    setTimeout(() => {
      cache.delete(appid);
      unavailable.delete(appid);
    }, 10000);
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// Only RetroAchievements' own images are shown.
const badgeUrl = (u: string) => (/^https:\/\/media\.retroachievements\.org\/[\w/.-]+$/.test(u) ? u : "");

function ringSvg(share: number): string {
  const r = 24;
  const c = 2 * Math.PI * r;
  const fill =
    share > 0
      ? `<circle cx="27" cy="27" r="${r}" class="vz-ring-fill" stroke-dasharray="${(c * Math.min(100, share)) / 100} ${c}" transform="rotate(-90 27 27)"/>`
      : "";
  return `<svg class="vz-ring" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="${r}" class="vz-ring-track"/>${fill}<text x="27" y="27" class="vz-ring-text" dominant-baseline="central" text-anchor="middle">${num(Math.floor(share))} %</text></svg>`;
}

function panelHtml(d: Retro, tabs: Set<string>): string {
  // Each of Tender's tabs opens from the piece of this panel that names it: the achievements, the
  // description, the save and the BIOS. Where the game has nothing to show for one, a plain cell
  // stands in so it can still be opened.
  const cells: [string, string, string?][] = [];
  if (d.platform) cells.push([t.retroPlatform, esc(d.platform)]);
  if (d.year) cells.push([t.year, esc(d.year)]);
  if (d.genres.length) cells.push([t.genre, esc(d.genres.map(wordInSpanish).join(", "))]);
  if (d.save || tabs.has("SAVES"))
    cells.push([
      t.retroSave,
      d.save === "synced"
        ? `<span class="vz-retro-ok">${t.retroSaveSynced}</span>`
        : d.save === "conflict"
          ? `<span class="vz-retro-warn">${t.retroSaveConflict}</span>`
          : t.retroSee,
      "SAVES",
    ]);
  if (d.bios || tabs.has("BIOS"))
    cells.push([
      t.retroBios,
      d.bios === "ok"
        ? `<span class="vz-retro-ok">${t.retroBiosOk}</span>`
        : d.bios === "missing"
          ? `<span class="vz-retro-warn">${t.retroBiosMissing}</span>`
          : t.retroSee,
      "BIOS",
    ]);
  if (d.total <= 0 && tabs.has("ACHIEVEMENTS")) cells.push([t.retroTabAchievements, t.retroSee, "ACHIEVEMENTS"]);
  if (!d.summary && tabs.has("GAME INFO")) cells.push([t.retroTabInfo, t.retroSee, "GAME INFO"]);
  if (d.rating > 0) cells.push([t.retroRating, `${num(Math.round(d.rating))} %`]);
  const facts = cells
    .map(
      ([l, v, tab]) =>
        `<div class="vz-fact"${tab ? ` data-vz-tab="${tab}"` : ""}><span class="vz-fact-label">${l}</span><span class="vz-fact-value">${v}</span></div>`,
    )
    .join("");
  let ach = "";
  if (d.total > 0) {
    const next = (d.next ?? [])
      .map(
        (a) =>
          `<li class="vz-next-item">${badgeUrl(a.badge) ? `<img class="vz-icon" src="${badgeUrl(a.badge)}" alt="">` : `<span class="vz-icon"></span>`}<span class="vz-next-name">${esc(a.title)}</span><span class="vz-next-sub">${a.awarded > 0 ? t.retroPlayers(num(a.awarded)) : ""}</span></li>`,
      )
      .join("");
    ach = `<div class="vz-ach vz-${medal(d.earned, d.total) ?? "none"}" data-vz-tab="ACHIEVEMENTS"><div class="vz-ach-head">${ringSvg((d.earned / d.total) * 100)}<div class="vz-ach-sum"><div class="vz-ach-count"><span class="vz-ach-n">${d.earned}</span><span class="vz-ach-of">/${d.total}</span></div><div class="vz-ach-label">${d.earned >= d.total ? t.platinum : t.achievements}${d.hardcore > 0 ? ` · ${t.retroHardcore(d.hardcore)}` : ""}</div></div></div>${
      next ? `<ul class="vz-next"><li class="vz-next-cap"><span>${t.upNext}</span><span>${t.retroHave}</span></li>${next}</ul>` : ""
    }</div>`;
  }
  return `<div class="vz-cols${ach ? "" : " vz-solo"}">${ach}<div class="vz-about"><div class="vz-facts">${facts}</div>${
    d.summary ? `<p class="vz-desc" data-vz-tab="GAME INFO">${esc(d.summary)}</p>` : ""
  }</div></div>`;
}

// Last session and play time, in the play row, in the interface language (Tender's own are English).
function statsHtml(appid: number): string {
  const o: any = safe(() => appStore.GetAppOverviewByAppID(appid), null);
  const last = Number(o?.rt_last_time_played) || 0;
  const mins = Number(o?.minutes_playtime_forever) || 0;
  let when = t.sessionNever;
  if (last > 0) {
    const day = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
    const days = Math.round((day(Date.now()) - day(last * 1000)) / 86400000);
    when =
      days <= 0
        ? t.sessionToday
        : days === 1
          ? t.sessionYesterday
          : days < 30
            ? t.sessionDaysAgo(days)
            : new Date(last * 1000).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  }
  const time = mins < 60 ? `${mins} min` : `${num(mins / 60, 1)} h`;
  const cell = (l: string, v: string) => `<div class="vz-retro-stat"><span>${l}</span><b>${esc(v)}</b></div>`;
  return cell(t.lastSession, when) + (mins > 0 ? cell(t.playtime, time) : "");
}

const css = () => `${pageCss()}
.vz-retro-ok::before, .vz-retro-warn::before {
  content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: currentColor; margin-right: 7px; vertical-align: 1px;
}
.vz-retro-ok { color: #7fe0a8; }
.vz-retro-warn { color: var(--obs-warn, #ffb040); }
.vz-retro { position: relative; }
.vz-retro-stats { display: flex; gap: 22px; margin-left: 14px; white-space: nowrap; }
.vz-retro-stat span { display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.5); }
.vz-retro-stat b { display: block; margin-top: 3px; font-size: 16px; font-weight: 600; color: #f4f4f4; }
/* From the first frame of a RomM game page, before the panel is there: Tender's own figures, tabs
   and tab content never show, so its page is not seen for a moment and then replaced. */
:root[data-vz-retro-on] .romm-info-items,
:root[data-vz-retro-on] .romm-tab-content,
:root[data-vz-retro-on] .romm-tab:not([data-vz-at]) { display: none !important; }
:root[data-vz-retro-on] .romm-tab-bar {
  height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important;
}
.vz-seg b.off { opacity: 0.45; }
/* Tender's tabs are the things you can press here, but not as a row of buttons: each one lies,
   see-through, over the piece of the panel that names it (placed by the code below), so that
   piece is what gets the ring and opens. */
[data-vz-retro] .romm-tab-bar {
  height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important;
  overflow: visible !important; background: transparent !important;
}
[data-vz-retro] button.romm-tab.romm-tab.DialogButton.DialogButton.DialogButton,
[data-vz-retro] button.romm-tab.romm-tab.DialogButton.DialogButton.DialogButton.gpfocus,
[data-vz-retro] button.romm-tab.romm-tab.DialogButton.DialogButton.DialogButton:hover {
  background: transparent !important; color: transparent !important;
}
[data-vz-retro] .romm-tab.romm-tab {
  position: fixed !important; margin: 0 !important; padding: 0 !important; min-width: 0 !important;
  background: transparent !important; box-shadow: none !important; border-radius: 12px !important;
  font-size: 0 !important; color: transparent !important; filter: none !important;
  outline: 1.5px solid transparent; transition: outline-color calc(140ms * var(--obs-motion, 0)) ease-out;
}
[data-vz-retro] .romm-tab:not([data-vz-at]) { display: none !important; }
[data-vz-retro] .romm-tab.gpfocus { outline-color: var(--obs-ring, #b8f35a) !important; }
/* What a tab holds stays out of the page until it is opened; then it comes up over the page: a
   black sheet with the rest dimmed, scrolling inside. Calm and flat: no boxes inside boxes, no
   capitals, and every ring drawn inside its row so none can leave the sheet. */
[data-vz-retro] .romm-tab-content { display: none !important; }
[data-vz-retro][data-vz-sheet] .romm-tab-content {
  display: block !important; position: fixed !important; z-index: 20;
  margin: 0 !important; padding: 20px 26px 24px !important; box-sizing: border-box;
  overflow-y: auto; border-radius: 18px; background: #000 !important;
  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.78);
  animation: vz-sheet calc(160ms * var(--obs-motion, 0)) cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
[data-vz-retro][data-vz-sheet] .romm-tab-content::-webkit-scrollbar { display: none; }
[data-vz-retro][data-vz-sheet] .romm-tab-content::before {
  content: attr(data-vz-title); display: block; position: sticky; top: -20px; z-index: 2;
  margin: -20px -26px 8px; padding: 18px 26px 10px; background: #000;
  font-size: 22px; font-weight: 700; letter-spacing: -0.2px; color: #f4f4f4;
}
[data-vz-sheet] .romm-tab-content * { text-transform: none !important; letter-spacing: 0 !important; }
/* Flat, like the rest of the interface: everything of Tender's inside sits straight on the black,
   with no grey boxes; what is selected gets the ring, nothing gets a fill. */
[data-vz-sheet] .romm-tab-content *:not(img):not(.romm-cheevo-progress-bar):not(.romm-cheevo-progress-fill):not(.romm-status-dot) {
  background-color: transparent !important; background-image: none !important;
  border-color: transparent !important; box-shadow: none !important; filter: none !important;
}
[data-vz-sheet] .romm-tab-content { scroll-padding: 64px 0 20px; }
/* Tender clips some of its boxes; the ring of what is inside must not be cut. */
[data-vz-sheet] .romm-tab-content .romm-slot-panel, [data-vz-sheet] .romm-tab-content .romm-slot-body { overflow: visible !important; }
[data-vz-sheet] .romm-tab-content .gpfocus {
  outline: 1.5px solid var(--obs-ring, #b8f35a) !important; outline-offset: 2px !important;
  border-radius: 12px !important;
}
[data-vz-sheet] .romm-tab-content .romm-cheevo-progress-bar { background: rgba(255, 255, 255, 0.12) !important; border-radius: 3px; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-progress-fill { background: var(--obs-reward, #f5cf5a) !important; border-radius: 3px; }
/* Actions keep the theme's quiet button. */
[data-vz-sheet] .romm-tab-content button.DialogButton.DialogButton:not(.romm-cheevo-row):not(.romm-panel-section):not(.romm-slot-header):not(:has(div)) {
  background-color: rgba(255, 255, 255, 0.08) !important; border-radius: 12px !important; color: #f4f4f4 !important;
}
/* A whole block that takes the selection (the game's card, the BIOS list): the sheet is its frame. */
[data-vz-sheet] .romm-tab-content .romm-panel-section.romm-panel-section.romm-panel-section.DialogButton.DialogButton,
[data-vz-sheet] .romm-tab-content .romm-panel-section.romm-panel-section.romm-panel-section.DialogButton.DialogButton.gpfocus {
  outline: 0 solid transparent !important; padding: 0 !important; text-align: left;
}
[data-vz-sheet] .romm-tab-content .romm-panel-section-title,
[data-vz-sheet] .romm-tab-content .romm-cheevo-section-title {
  font-size: 14px !important; font-weight: 600 !important; color: rgba(255, 255, 255, 0.55) !important;
  margin: 16px 0 8px !important;
}
[data-vz-sheet] .romm-tab-content .romm-cheevo-row { margin-bottom: 8px !important; padding: 6px 8px !important; }
[data-vz-sheet] .romm-tab-content .romm-panel-label { color: rgba(255, 255, 255, 0.5) !important; }
[data-vz-sheet] .romm-tab-content .romm-panel-summary { color: rgba(255, 255, 255, 0.78) !important; line-height: 1.5 !important; }
/* Achievements: X shows all, earned or pending; Y changes the order. What is chosen shows by the title. */
[data-vz-sheet] .romm-tab-content[data-vz-filter="earned"] .romm-cheevo-row:not(.romm-cheevo-row-earned),
[data-vz-sheet] .romm-tab-content[data-vz-filter="locked"] .romm-cheevo-row.romm-cheevo-row-earned,
[data-vz-sheet] .romm-tab-content[data-vz-plain="0"] .romm-cheevo-section-title { display: none !important; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-summary { order: -3; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-progress-bar { order: -2; }
/* The controls stay under the title while the list scrolls: the three views as tabs (the current
   one white on grey, like every selector here) and the order's current value. */
[data-vz-sheet] .romm-tab-content[data-vz-tools]::before { padding-bottom: 60px; }
[data-vz-sheet] .romm-tab-content[data-vz-tools] { scroll-padding-top: 124px; }
.vz-sheet-tools {
  position: fixed; z-index: 2147483000; display: flex; align-items: center; justify-content: space-between;
  font-size: 14px; pointer-events: none; font-family: "Motiva Sans", sans-serif;
}
.vz-sheet-tools > span { display: flex; align-items: center; gap: 10px; }
.vz-sheet-tools i {
  display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
  border-radius: 50%; background: rgba(255, 255, 255, 0.85); color: #000;
  font-style: normal; font-size: 12px; font-weight: 700;
}
.vz-seg { display: inline-flex; gap: 4px; padding: 4px; border-radius: 14px; background: rgba(255, 255, 255, 0.06); }
.vz-seg b {
  padding: 6px 14px; border-radius: 10px; font-weight: 600; color: rgba(255, 255, 255, 0.55);
  transition: background-color calc(160ms * var(--obs-motion, 0)) ease-out, color calc(160ms * var(--obs-motion, 0)) ease-out;
}
.vz-seg b.on { background: rgba(255, 255, 255, 0.12); color: #fff; }
.vz-seg em { margin-left: 6px; font-style: normal; font-weight: 500; font-variant-numeric: tabular-nums; opacity: 0.6; }
.vz-sheet-tools .vz-order { font-weight: 600; color: #f4f4f4; }
/* Achievement rows on one grid: badge, text, date, points, each column at the same place in
   every row. One date (Tender repeats it for hardcore), with the hardcore mark beside it. */
[data-vz-sheet] .romm-tab-content .romm-cheevo-row { align-items: center !important; gap: 14px !important; padding: 8px 10px !important; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-img-wrap,
[data-vz-sheet] .romm-tab-content .romm-cheevo-row > img.romm-cheevo-badge-img { flex: none !important; width: 48px !important; height: 48px !important; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-badge-img { border-radius: 8px !important; display: block !important; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-details { flex: 1 1 0 !important; min-width: 0 !important; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-title { font-size: 15px !important; font-weight: 600 !important; line-height: 20px !important; color: #f4f4f4 !important; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-desc { font-size: 13px !important; line-height: 18px !important; color: rgba(255, 255, 255, 0.7) !important; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-rarity { font-size: 12px !important; line-height: 17px !important; color: rgba(255, 255, 255, 0.45) !important; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-dates {
  flex: none !important; width: 122px !important; flex-direction: row !important; align-items: center !important;
  justify-content: flex-end !important; gap: 8px !important;
}
[data-vz-sheet] .romm-tab-content .romm-cheevo-dates:has(.romm-cheevo-hc-badge) > .romm-cheevo-date { display: none !important; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-dates > span:not([class]) { gap: 8px !important; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-date { font-size: 12px !important; line-height: 17px !important; color: rgba(255, 255, 255, 0.55) !important; padding: 0 !important; white-space: nowrap; }
[data-vz-sheet] .romm-tab-content .romm-cheevo-hc-badge {
  font-size: 10px !important; font-weight: 700 !important; line-height: 16px !important; padding: 0 5px !important;
  border-radius: 5px !important; color: var(--obs-reward, #f5cf5a) !important;
  outline: 1px solid currentColor; outline-offset: -1px;
}
[data-vz-sheet] .romm-tab-content .romm-cheevo-points {
  flex: none !important; width: 52px !important; text-align: right !important; padding: 0 !important;
  font-size: 13px !important; font-weight: 600 !important; font-variant-numeric: tabular-nums;
  color: var(--obs-reward, #f5cf5a) !important;
}
[data-vz-sheet] .romm-tab-content .romm-cheevo-points-locked { color: rgba(255, 255, 255, 0.55) !important; }
/* Steam draws its own ring as a separate layer over the whole window, so it can run past the
   sheet: off while a sheet is open (the rows inside draw theirs, see above). */
:root[data-vz-sheet-open] [class*="1wPplsegQqCoe06wXPhzKT"] { display: none !important; }
[data-vz-sheet] .romm-tab-content .romm-panel-section-title,
[data-vz-sheet] .romm-tab-content .romm-cheevo-section-title {
  font-size: 14px !important; font-weight: 600 !important; color: rgba(255, 255, 255, 0.55) !important;
  border: 0 !important; margin: 14px 0 8px !important;
}
[data-vz-sheet] .romm-tab-content .romm-cheevo-row,
[data-vz-sheet] .romm-tab-content .romm-slot-panel {
  background: #121212 !important; border: 0 !important; border-radius: 12px !important; box-shadow: none !important;
}
[data-vz-sheet] .romm-tab-content .romm-cheevo-row { margin-bottom: 6px !important; }
[data-vz-sheet] .romm-tab-content .romm-panel-label { color: rgba(255, 255, 255, 0.5) !important; }
[data-vz-sheet] .romm-tab-content .romm-panel-summary { color: rgba(255, 255, 255, 0.78) !important; line-height: 1.5 !important; }
@keyframes vz-sheet { from { opacity: 0; translate: 0 8px; } to { opacity: 1; translate: 0 0; } }
/* And moving back up to the play row brings the whole first screen back, not just the button. */
[data-vz-retro] .romm-play-section-row button,
[data-vz-retro] .romm-play-section-row .Focusable { scroll-margin-top: 100vh; }
`;

const STYLE = "vz-retro-style";
const scrollClass = (appDetailsClasses as Record<string, string>).ScrollContainer;

// Tender's name for a tab (its text), kept aside the first time we see it.
const tabName = (tab: HTMLElement) => (tab.dataset.vzName ??= (tab.textContent ?? "").trim().toUpperCase());

// Tender's tab names, in our words.
const tabLabel = (name: string) =>
  (({ "GAME INFO": t.retroTabInfo, ACHIEVEMENTS: t.retroTabAchievements, SAVES: t.retroTabSaves, BIOS: "BIOS" }) as Record<string, string>)[
    name.trim().toUpperCase()
  ] ?? name.trim();

const pageOfRetro = (doc: Document) => doc.querySelector("[data-vz-retro]") as HTMLElement | null;
const sheetOf = (doc: Document) => doc.querySelector("[data-vz-retro] .romm-tab-content") as HTMLElement | null;

function closeSheet(doc: Document, refocus: boolean) {
  const page = pageOfRetro(doc);
  if (!page?.hasAttribute("data-vz-sheet")) return;
  page.removeAttribute("data-vz-sheet");
  doc.documentElement.removeAttribute("data-vz-sheet-open");
  inside = null;
  sheetName = "";
  unplace(sheetOf(doc));
  applyAchievements(doc);
  if (refocus) (doc.querySelector(".romm-tab.romm-tab-active") as HTMLElement | null)?.focus();
}

// A press on one of the buttons: Tender switches to that tab as always; we show what it holds over
// the page and move the selection into it (it may take a moment to load).
function openSheet(doc: Document, tab: HTMLElement) {
  const page = pageOfRetro(doc);
  if (!page) return;
  const title = tab.dataset.vzLabel ?? tab.textContent ?? "";
  sheetName = tabName(tab);
  page.setAttribute("data-vz-sheet", "");
  doc.documentElement.setAttribute("data-vz-sheet-open", "");
  let tries = 0;
  const enter = () => {
    const sheet = sheetOf(doc);
    if (!sheet || !page.hasAttribute("data-vz-sheet")) return;
    sheet.dataset.vzTitle = title;
    place(sheet);
    applyAchievements(doc);
    sheet.scrollTop = 0;
    // The first thing in it that really takes the selection (some wrappers do not).
    const within = () => !!sheet.querySelector(".gpfocus") || sheet.contains(doc.activeElement);
    for (const el of selectable(sheet).slice(0, 12)) {
      el.focus();
      if (within()) break;
    }
    if (!within() && ++tries < 12) setTimeout(enter, 250);
  };
  setTimeout(enter, 60);
}

// The sheet fills the window less a margin, clear of the top bar and the button hints. An ancestor
// of Tender's content is the frame "fixed" is measured from, so the numbers are worked out from
// where the sheet actually lands.
function place(sheet: HTMLElement) {
  const view = sheet.ownerDocument.defaultView;
  if (!view) return;
  const [mx, top, bottom] = [40, 44, 48];
  sheet.style.top = "0px";
  sheet.style.left = "0px";
  const at = sheet.getBoundingClientRect();
  sheet.style.top = `${top - at.top}px`;
  sheet.style.left = `${mx - at.left}px`;
  sheet.style.width = `${view.innerWidth - 2 * mx}px`;
  sheet.style.height = `${view.innerHeight - top - bottom}px`;
}
const unplace = (sheet: HTMLElement | null) =>
  sheet && ["top", "left", "width", "height"].forEach((k) => sheet.style.removeProperty(k));

// The achievements sheet: what to show and in which order (kept while Steam runs).
type Filter = "all" | "earned" | "locked";
type Order = "game" | "common" | "rare" | "points";
const FILTERS: Filter[] = ["all", "earned", "locked"];
const ORDERS: Order[] = ["game", "common", "rare", "points"];
let filter: Filter = "all";
let order: Order = "game";
let sheetName = ""; // Tender's name of the tab the open sheet shows

const firstNumber = (el: Element | null) => Number((el?.textContent ?? "").replace(/[^\d]/g, "")) || 0;
const visibleRows = (sheet: HTMLElement) =>
  Array.from(sheet.querySelectorAll<HTMLElement>(".romm-cheevo-row"))
    .filter((r) => r.offsetParent !== null)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

function counts(rows: HTMLElement[]): Record<Filter, number> {
  const earned = rows.filter((r) => r.classList.contains("romm-cheevo-row-earned")).length;
  return { all: rows.length, earned, locked: rows.length - earned };
}
// What can take the selection in the sheet, as shown.
const selectable = (sheet: HTMLElement) =>
  Array.from(sheet.querySelectorAll<HTMLElement>("button, .Focusable")).filter((el) => el.offsetParent !== null);
// Selecting the first thing in the sheet must not push its top out of sight (the list scrolls a
// selected row into place a moment later, more than once).
function keepTop(sheet: HTMLElement, el: HTMLElement) {
  for (const ms of [0, 120, 300, 500])
    setTimeout(() => {
      if (inside === el && selectable(sheet)[0] === el) sheet.scrollTop = 0;
    }, ms);
}

// Applies the choice to Tender's list without touching its nodes' order: the list is a column, so
// each row only gets its place in it.
// RomM's newer reading after a game, put over Tender's list (which keeps its older one for an
// hour): the rows earned since are marked as Tender marks them, with their own badge, and the
// summary and bar count them. Tender drawing the list again undoes it; this runs again then.
const BADGE = /\/Badge\/(\d+)(_lock)?\.png/;
function patchSheet(sheet: HTMLElement, f: Fresh): boolean {
  let any = false;
  sheet.querySelectorAll<HTMLElement>(".romm-cheevo-row").forEach((row) => {
    const img = row.querySelector<HTMLImageElement>("img.romm-cheevo-badge-img");
    const m = img ? BADGE.exec(img.getAttribute("src") ?? "") : null;
    if (!m || !f.ids.has(m[1]) || row.classList.contains("romm-cheevo-row-earned")) return;
    any = true;
    row.classList.add("romm-cheevo-row-earned");
    row.dataset.vzEarned = "";
    if (m[2]) img!.setAttribute("src", img!.getAttribute("src")!.replace("_lock.png", ".png"));
    img!.style.removeProperty("filter");
    if (f.hardcoreIds.has(m[1])) img!.classList.add("romm-cheevo-badge-img-hc");
    row.querySelector(".romm-cheevo-points-locked")?.classList.remove("romm-cheevo-points-locked");
  });
  const summary = sheet.querySelector(".romm-cheevo-summary-text");
  const text = inSpanish(`${f.earned} / ${f.total} Achievements`);
  if (summary && f.total && summary.textContent !== text) summary.textContent = text;
  const fill = sheet.querySelector<HTMLElement>(".romm-cheevo-progress-fill");
  const width = `${f.total ? (f.earned / f.total) * 100 : 0}%`;
  if (fill && f.total && fill.style.width !== width) fill.style.width = width;
  return any || !!sheet.querySelector("[data-vz-earned]");
}

let shownApp = 0; // the game whose page is open
function applyAchievements(doc: Document) {
  const sheet = sheetOf(doc);
  const tools = doc.querySelector(".vz-sheet-tools") as HTMLElement | null;
  const on = !!sheet && sheetName === "ACHIEVEMENTS" && !!pageOfRetro(doc)?.hasAttribute("data-vz-sheet");
  if (!on || !sheet) {
    tools?.remove();
    sheet?.removeAttribute("data-vz-tools");
    return;
  }
  const f = fresh.get(shownApp);
  const patched = f ? patchSheet(sheet, f) : false;
  const rows = Array.from(sheet.querySelectorAll<HTMLElement>(".romm-cheevo-row"));
  // A view with nothing in it (no achievement earned yet, or all of them) is never shown: there
  // would be nothing to select.
  if (rows.length && !counts(rows)[filter]) filter = "all";
  const key = `${filter}|${order}|${rows.length}|${patched ? counts(rows).earned : "-"}`;
  if (sheet.dataset.vzApplied !== key) {
    sheet.dataset.vzApplied = key;
    sheet.dataset.vzFilter = filter;
    // Rows marked here sit where Tender put them, among the pending ones: its headings would lie,
    // so they go and the earned come first.
    sheet.dataset.vzPlain = filter === "all" && order === "game" && !patched ? "1" : "0";
    if (order === "game" && patched) {
      rows.forEach((r, i) => (r.style.order = String(r.classList.contains("romm-cheevo-row-earned") ? i + 1 : rows.length + i + 1)));
    } else if (order === "game") rows.forEach((r) => r.style.removeProperty("order"));
    else {
      const value = (r: HTMLElement) =>
        order === "points" ? -firstNumber(r.querySelector(".romm-cheevo-points")) : firstNumber(r.querySelector(".romm-cheevo-rarity")) * (order === "common" ? -1 : 1);
      rows
        .map((r, i) => [r, value(r), i] as const)
        .sort((a, b) => a[1] - b[1] || a[2] - b[2])
        .forEach(([r], i) => (r.style.order = String(i + 1)));
    }
  }
  let el = tools;
  if (!el) {
    el = doc.createElement("div");
    el.className = "vz-sheet-tools";
    doc.body.appendChild(el);
  }
  // The three views as tabs with how many each holds, so X is seen stepping along them; the order
  // shows its current value by Y.
  const count = counts(rows);
  const views = FILTERS.map(
    (f) => `<b class="${f === filter ? "on" : count[f] ? "" : "off"}">${t.retroFilter[f]}<em>${count[f]}</em></b>`,
  ).join("");
  const html = `<span><i>X</i><span class="vz-seg">${views}</span></span><span><i>Y</i><span class="vz-order">${t.retroOrder[order]}</span></span>`;
  if (!sheet.hasAttribute("data-vz-tools")) sheet.setAttribute("data-vz-tools", "");
  if (el.dataset.html !== html) {
    el.dataset.html = html;
    el.innerHTML = html;
  }
  const r = sheet.getBoundingClientRect();
  el.style.top = `${Math.round(r.top + 62)}px`;
  el.style.left = `${Math.round(r.left + 26)}px`;
  el.style.width = `${Math.round(r.width - 52)}px`;
}

// The topmost piece of the panel that can be opened (the leftmost of a row).
function firstPiece(doc: Document): HTMLElement | null {
  const all = Array.from(doc.querySelectorAll<HTMLElement>("[data-vz-retro] .romm-tab[data-vz-at]"));
  return (
    all.sort((p, q) => {
      const [a, b] = [p.getBoundingClientRect(), q.getBoundingClientRect()];
      return Math.abs(a.top - b.top) > 20 ? a.top - b.top : a.left - b.left;
    })[0] ?? null
  );
}

let last: HTMLElement | null = null; // what had the selection before
let inside: HTMLElement | null = null; // the last thing selected inside the open sheet
const handlers = new WeakMap<Document, Array<[string, EventListener]>>();
function listen(doc: Document) {
  if (handlers.has(doc)) return;
  const onClick: EventListener = (e) => {
    const tab = (e.target as HTMLElement | null)?.closest?.("[data-vz-retro] .romm-tab") as HTMLElement | null;
    if (tab) openSheet(doc, tab);
  };
  // B closes the sheet instead of doing what it does on the page.
  const onCancel: EventListener = (e) => {
    if (!pageOfRetro(doc)?.hasAttribute("data-vz-sheet")) return;
    e.stopPropagation();
    closeSheet(doc, true);
  };
  // The selection stays inside an open sheet (B is the way out): a move that would leave it, such
  // as up from its first row, comes back to where it was.
  const onFocus: EventListener = (e) => {
    const page = pageOfRetro(doc);
    if (!page?.hasAttribute("data-vz-sheet")) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const sheet = sheetOf(doc);
    if (sheet && sheet.contains(target)) {
      inside = target;
      keepTop(sheet, target);
      return;
    }
    // Back to where it was, or to the first thing the sheet shows; with nothing to select the sheet closes.
    const back = inside?.isConnected && inside.offsetParent !== null ? inside : sheet ? selectable(sheet)[0] : null;
    if (back) setTimeout(() => back.focus(), 0);
    else closeSheet(doc, true);
  };
  // Among the pieces of the panel the selection moves by where they are on screen, not by the
  // order of Tender's tabs. With nothing in that direction the press goes on as usual (up reaches
  // the play row).
  const onDirection: EventListener = (e) => {
    const dir = Number((e as CustomEvent).detail?.button);
    if (pageOfRetro(doc)?.hasAttribute("data-vz-sheet")) {
      // Inside the sheet Tender's rows move as they always do. A single block taller than the
      // sheet (the BIOS list, a long description) has nowhere to move to, so up and down scroll it.
      const sheet = sheetOf(doc);
      // Achievements move through the rows as they are shown (filtered, reordered), not as Tender
      // lists them.
      const row = (e.target as HTMLElement | null)?.closest?.(".romm-cheevo-row") as HTMLElement | null;
      if (sheet && row && (dir === 9 || dir === 10)) {
        e.stopPropagation();
        const rows = visibleRows(sheet);
        const next = rows[rows.indexOf(row) + (dir === 10 ? 1 : -1)];
        if (next)
          setTimeout(() => {
            next.focus();
            next.scrollIntoView({ block: "nearest" });
          }, 0);
        else if (dir === 9) sheet.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const block = (e.target as HTMLElement | null)?.closest?.(".romm-panel-section") as HTMLElement | null;
      if (!sheet || !block || (dir !== 9 && dir !== 10) || block.offsetHeight <= sheet.clientHeight) return;
      const room = dir === 10 ? sheet.scrollHeight - sheet.clientHeight - sheet.scrollTop : sheet.scrollTop;
      if (room <= 1) return;
      e.stopPropagation();
      sheet.scrollBy({ top: (dir === 10 ? 1 : -1) * Math.round(sheet.clientHeight * 0.6), behavior: "smooth" });
      return;
    }
    // Down from the play row goes straight to the first piece of the panel. Left to Steam it lands
    // on whichever tab Tender has current (the description) and only then gets moved, which showed.
    if (dir === 10 && (e.target as HTMLElement | null)?.closest?.("[data-vz-retro] .romm-play-section-row")) {
      const first = firstPiece(doc);
      if (first) {
        e.stopPropagation();
        last = first;
        setTimeout(() => first.focus(), 0);
      }
      return;
    }
    const from = (e.target as HTMLElement | null)?.closest?.("[data-vz-retro] .romm-tab") as HTMLElement | null;
    if (!from) return;
    const [dx, dy] = dir === 9 ? [0, -1] : dir === 10 ? [0, 1] : dir === 11 ? [-1, 0] : dir === 12 ? [1, 0] : [0, 0];
    if (!dx && !dy) return;
    const a = from.getBoundingClientRect();
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const tab of Array.from(doc.querySelectorAll<HTMLElement>("[data-vz-retro] .romm-tab[data-vz-at]"))) {
      if (tab === from) continue;
      const b = tab.getBoundingClientRect();
      // How far the other one starts beyond this one's edge in that direction, and how far aside.
      const along = dx ? (dx > 0 ? b.left - a.right : a.left - b.right) : dy > 0 ? b.top - a.bottom : a.top - b.bottom;
      if (along < -4) continue;
      const aside = dx
        ? Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
        : Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      // Between two equally near, the one that starts level with this one.
      const level = dx ? Math.abs(b.top - a.top) : Math.abs(b.left - a.left);
      const score = Math.max(0, along) + 3 * aside + level / 100;
      if (score < bestScore) {
        bestScore = score;
        best = tab;
      }
    }
    if (dy < 0 && best) {
      // Something above only counts when it is right over this one; otherwise up leaves to the play row.
      const b = best.getBoundingClientRect();
      if (Math.max(a.left, b.left) >= Math.min(a.right, b.right)) best = null;
    }
    // Up with nothing above goes on to the play row; any other press stays among the pieces
    // (Tender's own order of tabs means nothing here).
    if (!best && dy < 0) return;
    e.stopPropagation();
    const to = best;
    if (to) setTimeout(() => to.focus(), 0);
  };
  // Coming down from the play row lands on the topmost piece (the leftmost of a row), whatever tab
  // Tender had current.
  const onEnter: EventListener = (e) => {
    const target = e.target as HTMLElement | null;
    const to = target?.closest?.("[data-vz-retro] .romm-tab") as HTMLElement | null;
    const fromEl = last;
    last = target;
    if (!to || fromEl?.closest?.(".romm-tab, .romm-tab-content") || pageOfRetro(doc)?.hasAttribute("data-vz-sheet")) return;
    const first = firstPiece(doc);
    if (first && first !== to) setTimeout(() => first.focus(), 0);
  };
  // X and Y in the achievements sheet: what to show, and the order.
  const onButton: EventListener = (e) => {
    const button = Number((e as CustomEvent).detail?.button);
    if ((button !== 3 && button !== 4) || sheetName !== "ACHIEVEMENTS" || !pageOfRetro(doc)?.hasAttribute("data-vz-sheet")) return;
    e.stopPropagation();
    const sheet = sheetOf(doc);
    if (!sheet) return;
    if (button === 3) {
      // The next view that has something in it.
      const count = counts(Array.from(sheet.querySelectorAll<HTMLElement>(".romm-cheevo-row")));
      let i = FILTERS.indexOf(filter);
      do i = (i + 1) % FILTERS.length;
      while (!count[FILTERS[i]] && FILTERS[i] !== filter);
      filter = FILTERS[i];
    } else order = ORDERS[(ORDERS.indexOf(order) + 1) % ORDERS.length];
    applyAchievements(doc);
    const first = visibleRows(sheet)[0];
    if (first) setTimeout(() => first.focus(), 0);
  };
  const list: Array<[string, EventListener]> = [
    ["vgp_onbuttondown", onButton],
    ["vgp_ondirection", onDirection],
    ["focusin", onEnter],
    ["click", onClick],
    ["vgp_oncancel", onCancel],
    ["focusin", onFocus],
  ];
  for (const [name, fn] of list) doc.addEventListener(name, fn, true);
  handlers.set(doc, list);
}
function unlisten(doc: Document) {
  for (const [name, fn] of handlers.get(doc) ?? []) doc.removeEventListener(name, fn, true);
  handlers.delete(doc);
}

const ON = "data-vz-retro-on";
// Takes everything of ours off the page. `keep` leaves the style and the mark that hides Tender's
// tabs from the first frame: the retro page is on, this just is not one (or not yet).
function clear(doc: Document | undefined, keep = false) {
  if (!doc) return;
  doc.querySelectorAll(".vz-retro, .vz-retro-stats").forEach((n) => n.remove());
  doc.querySelectorAll("[data-vz-retro]").forEach((n) => {
    n.removeAttribute("data-vz-retro");
    n.removeAttribute("data-vz-page");
    n.removeAttribute("data-vz-sheet");
  });
  doc.documentElement.removeAttribute("data-vz-sheet-open");
  doc.querySelector(".vz-sheet-tools")?.remove();
  const sheet = doc.querySelector(".romm-tab-content") as HTMLElement | null;
  if (sheet) {
    for (const a of ["data-vz-filter", "data-vz-plain", "data-vz-applied", "data-vz-title", "data-vz-tools"]) sheet.removeAttribute(a);
    sheet.querySelectorAll<HTMLElement>(".romm-cheevo-row").forEach((r) => r.style.removeProperty("order"));
  }
  sheetName = "";
  restoreText();
  doc.querySelectorAll<HTMLElement>("[data-vz-label]").forEach((n) => {
    for (const a of ["data-vz-label", "data-vz-at", "data-vz-name"]) n.removeAttribute(a);
    for (const k of ["left", "top", "width", "height"]) n.style.removeProperty(k);
  });
  unlisten(doc);
  if (keep) return;
  doc.documentElement.removeAttribute(ON);
  doc.getElementById(STYLE)?.remove();
}

// Looks at the page a few times a second: Tender draws its row when it is ready, and may draw it
// again. Cheap when there is nothing to do (two lookups).
function sync() {
  const win = safe(() => SteamUIStore.WindowStore.GamepadUIMainWindowInstance, null as any);
  const doc: Document | undefined = win?.BrowserWindow?.document;
  if (!doc) return;
  const m = /^\/library\/app\/(\d+)$/.exec(String(win?.m_history?.location?.pathname ?? ""));
  const appid = m ? Number(m[1]) : 0;
  const row = appid ? (doc.querySelector(".romm-play-section-row") as HTMLElement | null) : null;
  if (!settings().retro) return clear(doc);
  watch(doc);
  if (!doc.getElementById(STYLE)) {
    const style = doc.createElement("style");
    style.id = STYLE;
    style.textContent = css();
    doc.head.appendChild(style);
  }
  const root = doc.documentElement;
  if (!row || !row.parentElement) {
    if (!root.hasAttribute(ON)) root.setAttribute(ON, "");
    return clear(doc, true);
  }
  shownApp = appid;
  if (!cache.has(appid)) {
    cache.set(appid, null);
    load(appid);
  }
  const data = cache.get(appid);
  // Nothing from Tender for this game: its own page shows as it is.
  root.toggleAttribute(ON, !!data || !unavailable.has(appid));
  if (!data) return clear(doc, true);
  if (data.retryAt && Date.now() >= data.retryAt) {
    data.retryAt = undefined;
    load(appid);
  }
  let panel = row.parentElement.querySelector(":scope > .vz-retro") as HTMLElement | null;
  if (panel && panel.dataset.app !== String(appid)) {
    panel.remove();
    panel = null;
  }
  if (!panel) {
    panel = doc.createElement("div");
    panel.className = "vz-root vz-retro";
    panel.dataset.app = String(appid);
    row.after(panel);
  }
  const tabs = Array.from(doc.querySelectorAll<HTMLElement>(".romm-tab"));
  const html = panelHtml(data, new Set(tabs.map(tabName)));
  if (panel.dataset.html !== html) {
    panel.dataset.html = html;
    panel.innerHTML = html;
  }
  let stats = row.querySelector(":scope .vz-retro-stats") as HTMLElement | null;
  const info = row.querySelector(".romm-info-items");
  if (!stats && info) {
    stats = doc.createElement("div");
    stats.className = "vz-retro-stats";
    info.after(stats);
  }
  if (stats) {
    const s = statsHtml(appid);
    if (stats.dataset.html !== s) {
      stats.dataset.html = s;
      stats.innerHTML = s;
    }
  }
  const page = scrollClass ? (panel.closest(`.${scrollClass}`) as HTMLElement | null) : null;
  if (page && !page.hasAttribute("data-vz-retro")) {
    page.setAttribute("data-vz-retro", "");
    page.setAttribute("data-vz-page", "");
  }
  listen(doc);
  applyAchievements(doc);
  keepTranslated(row);
  keepTranslated(doc.querySelector(".romm-tab-content") as HTMLElement | null);
  fitPanel(panel, false);
  // Each of Tender's tabs goes over the piece of the panel that opens it, a little wider than it
  // so the ring has air, and never past the edge of the window.
  const view = doc.defaultView;
  for (const tab of tabs) {
    const name = tabName(tab);
    const label = tabLabel(name);
    if (tab.dataset.vzLabel !== label) tab.dataset.vzLabel = label;
    const target = panel.querySelector(`[data-vz-tab="${name}"]`) as HTMLElement | null;
    const r = target?.getBoundingClientRect();
    if (!r || !view || r.width <= 0 || r.height <= 0) {
      tab.removeAttribute("data-vz-at");
      continue;
    }
    const pad = 7;
    const x = Math.max(6, r.left - pad);
    const y = r.top - pad;
    const w = Math.min(view.innerWidth - 6, r.right + pad) - x;
    const h = r.height + 2 * pad;
    const at = `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`;
    // Worked out from where the button actually lands (see place() below) and checked each time:
    // the page scrolling or Tender redrawing the bar moves it.
    const now = tab.getBoundingClientRect();
    if (tab.dataset.vzAt === at && Math.abs(now.left - x) < 1 && Math.abs(now.top - y) < 1) continue;
    tab.dataset.vzAt = at;
    tab.style.setProperty("left", "0px", "important");
    tab.style.setProperty("top", "0px", "important");
    tab.style.setProperty("width", `${w}px`, "important");
    tab.style.setProperty("height", `${h}px`, "important");
    const zero = tab.getBoundingClientRect();
    tab.style.setProperty("left", `${x - zero.left}px`, "important");
    tab.style.setProperty("top", `${y - zero.top}px`, "important");
  }
}

// The page is also looked at the moment Tender's row appears, not only on the next tick.
let watched: Document | null = null;
let observer: MutationObserver | null = null;
let soon = false;
let tickNow: () => void = () => {};
function watch(doc: Document) {
  if (watched === doc) return;
  observer?.disconnect();
  watched = doc;
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!view) return;
  observer = new view.MutationObserver(() => {
    if (soon || !doc.querySelector(".romm-play-section-row") || doc.querySelector(".vz-retro")) return;
    soon = true;
    view.requestAnimationFrame(() => {
      soon = false;
      tickNow();
    });
  });
  observer.observe(doc.body, { childList: true, subtree: true });
}

// After a retro game: RomM reads its achievements again (with Vistazo's own key) and the page
// shows them; without the key, what Tender has is read again a little later and a while later
// (Tender reads RomM again when the game ends, and RomM 5.5 reads RetroAchievements by itself
// after a game).
const pending = new Map<number, number[]>();
function afterGame(appid: number) {
  const data = cache.get(appid);
  if (!data || isUnloaded()) return;
  pending.get(appid)?.forEach(clearTimeout);
  const again = () => {
    if (!isUnloaded() && cache.has(appid)) load(appid);
  };
  pending.set(appid, [setTimeout(again, 20 * 1000), setTimeout(again, 3 * 60 * 1000)] as unknown as number[]);
  if (!data.raId) return;
  rommStatus().then(() => {
    if (!isLinked()) return;
    return rommProgress(data.raId, true).then((p) => {
      if (isUnloaded()) return;
      // Only a reading RomM has just made counts; anything else would hide what Tender reads later.
      if (!p?.ok || !p.changed) {
        fresh.delete(appid);
        if (p?.why === "refused") rommStatus();
        return;
      }
      fresh.set(appid, {
        ids: new Set(p.ids ?? []),
        hardcoreIds: new Set(p.hardcore_ids ?? []),
        earned: Number(p.earned) || 0,
        hardcore: Number(p.hardcore) || 0,
        total: Number(p.total) || 0,
      });
      const now = cache.get(appid);
      if (now) applyFresh(appid, now);
      changed();
    });
  }).catch((e) => console.warn("[Vistazo] achievements after a game", e));
}

function watchGames(): () => void {
  const reg = safe(
    () =>
      SteamClient.GameSessions.RegisterForAppLifetimeNotifications((u: any) => {
        if (u && u.bRunning === false && cache.get(Number(u.unAppID))) afterGame(Number(u.unAppID));
      }),
    null as any,
  );
  return () => {
    safe(() => reg?.unregister(), undefined);
    pending.forEach((ts) => ts.forEach(clearTimeout));
    pending.clear();
  };
}

export function watchRetroPages(): () => void {
  const tick = () => {
    if (isUnloaded()) return;
    try {
      sync();
    } catch (e) {
      console.warn("[Vistazo] retro page", e);
    }
  };
  listeners.add(tick);
  tickNow = tick;
  const timer = setInterval(tick, 400);
  const stopGames = watchGames();
  rommStatus();
  return () => {
    clearInterval(timer);
    stopGames();
    listeners.delete(tick);
    observer?.disconnect();
    observer = null;
    watched = null;
    tickNow = () => {};
    clear(safe(() => SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow.document, undefined as any));
  };
}
