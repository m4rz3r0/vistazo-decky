import { appDetailsClasses } from "@decky/ui";
import { medal } from "./data";
import { locale, num, t } from "./i18n";
import { isUnloaded } from "./lifecycle";
import { fitPanel } from "./Panel";
import { safe } from "./safe";
import { settings } from "./settings";
import { pageCss } from "./styles";

// The page of a RomM game. Tender (another plugin) owns that page: it replaces Steam's play row and
// adds its tabs (game info, achievements, saves, BIOS). Vistazo leaves all of that working and only
// adds, between Tender's play row and its tabs, the same first screen a Steam game gets: the
// achievements and what comes next on the left, the game on the right. Tender's tabs stay right
// below, one press down.
//
// It is plain DOM placed next to Tender's own nodes, not a React patch: two plugins rewriting the
// same React tree is where pages break. Nothing here can be focused, so the gamepad path through
// Tender's page is exactly what it was. All the data comes from Tender.
declare const DeckyBackend: any;
declare const SteamUIStore: any;
declare const appStore: any;

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
}

const cache = new Map<number, Retro | null>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

async function load(appid: number): Promise<void> {
  try {
    const g = await tender("get_cached_game_detail", appid);
    if (!g?.found || !g.rom_id) {
      cache.set(appid, null);
      return;
    }
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
      next: null,
    };
    cache.set(appid, retro);
    changed();
    // The slower reads fill in afterwards: which achievements are left, and the BIOS when Tender
    // had not looked yet.
    const [list, progress, bios] = await Promise.all([
      tender("get_achievements", g.rom_id).catch(() => null),
      tender("get_achievement_progress", g.rom_id).catch(() => null),
      g.bios_level ? null : tender("get_bios_status", g.rom_id).catch(() => null),
    ]);
    const b = bios?.bios_status;
    if (b?.needs_bios) retro.bios = b.bios_level === "ok" ? "ok" : "missing";
    if (progress?.success) {
      retro.earned = Number(progress.earned) || 0;
      retro.total = Number(progress.total) || 0;
      retro.hardcore = Number(progress.earned_hardcore) || 0;
    }
    if (Array.isArray(list?.achievements) && progress?.success) {
      const got = new Set((progress.earned_achievements ?? []).map((e: any) => String(e.id)));
      // The ones most players have come first: they are the nearest.
      retro.next = list.achievements
        .filter((a: any) => !got.has(String(a.badge_id)))
        .sort((a: any, b2: any) => (Number(b2.num_awarded) || 0) - (Number(a.num_awarded) || 0))
        .slice(0, 3)
        .map((a: any) => ({
          title: String(a.title ?? ""),
          badge: String(a.badge_url_lock ?? a.badge_url ?? ""),
          awarded: Number(a.num_awarded) || 0,
        }));
    } else {
      retro.next = [];
    }
    changed();
  } catch {
    cache.delete(appid); // Tender missing or not ready: asked again on the next look
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

function panelHtml(d: Retro): string {
  const cells: [string, string][] = [];
  if (d.platform) cells.push([t.retroPlatform, esc(d.platform)]);
  if (d.year) cells.push([t.year, esc(d.year)]);
  if (d.genres.length) cells.push([t.genre, esc(d.genres.join(", "))]);
  if (d.save)
    cells.push([
      t.retroSave,
      d.save === "synced"
        ? `<span class="vz-retro-ok">${t.retroSaveSynced}</span>`
        : `<span class="vz-retro-warn">${t.retroSaveConflict}</span>`,
    ]);
  if (d.bios)
    cells.push([
      t.retroBios,
      d.bios === "ok"
        ? `<span class="vz-retro-ok">${t.retroBiosOk}</span>`
        : `<span class="vz-retro-warn">${t.retroBiosMissing}</span>`,
    ]);
  if (d.rating > 0) cells.push([t.retroRating, `${num(Math.round(d.rating))} %`]);
  const facts = cells
    .map(([l, v]) => `<div class="vz-fact"><span class="vz-fact-label">${l}</span><span class="vz-fact-value">${v}</span></div>`)
    .join("");
  let ach = "";
  if (d.total > 0) {
    const next = (d.next ?? [])
      .map(
        (a) =>
          `<li class="vz-next-item">${badgeUrl(a.badge) ? `<img class="vz-icon" src="${badgeUrl(a.badge)}" alt="">` : `<span class="vz-icon"></span>`}<span class="vz-next-name">${esc(a.title)}</span><span class="vz-next-sub">${a.awarded > 0 ? t.retroPlayers(num(a.awarded)) : ""}</span></li>`,
      )
      .join("");
    ach = `<div class="vz-ach vz-${medal(d.earned, d.total) ?? "none"}"><div class="vz-ach-head">${ringSvg((d.earned / d.total) * 100)}<div class="vz-ach-sum"><div class="vz-ach-count"><span class="vz-ach-n">${d.earned}</span><span class="vz-ach-of">/${d.total}</span></div><div class="vz-ach-label">${d.earned >= d.total ? t.platinum : t.achievements}${d.hardcore > 0 ? ` · ${t.retroHardcore(d.hardcore)}` : ""}</div></div></div>${
      next ? `<ul class="vz-next"><li class="vz-next-cap"><span>${t.upNext}</span><span>${t.retroHave}</span></li>${next}</ul>` : ""
    }</div>`;
  }
  return `<div class="vz-cols${ach ? "" : " vz-solo"}">${ach}<div class="vz-about"><div class="vz-facts">${facts}</div>${
    d.summary ? `<p class="vz-desc">${esc(d.summary)}</p>` : ""
  }</div></div><div class="vz-retro-more">${t.retroMore}</div>`;
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
.vz-retro-more {
  position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.45);
}
.vz-retro-more::before {
  content: ""; display: inline-block; margin-right: 8px; vertical-align: 2px;
  border-top: 6px solid currentColor; border-left: 5px solid transparent; border-right: 5px solid transparent;
}
.vz-retro-stats { display: flex; gap: 22px; margin-left: 14px; white-space: nowrap; }
.vz-retro-stat span { display: block; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.5); }
.vz-retro-stat b { display: block; margin-top: 3px; font-size: 16px; font-weight: 600; color: #f4f4f4; }
/* Tender's own figures give way to ours (same data, in the interface language, no capitals). */
[data-vz-retro] .romm-info-items { display: none !important; }
/* Moving down to Tender's tabs brings them to the top of the screen, clear of the button hints,
   with their content below. */
[data-vz-retro] .romm-tab { scroll-margin-bottom: 400px; }
`;

const HINT = 28; // room the "more below" line takes at the bottom of the first screen
const STYLE = "vz-retro-style";
const scrollClass = (appDetailsClasses as Record<string, string>).ScrollContainer;

function clear(doc: Document | undefined) {
  if (!doc) return;
  doc.querySelectorAll(".vz-retro, .vz-retro-stats").forEach((n) => n.remove());
  doc.querySelectorAll("[data-vz-retro]").forEach((n) => {
    n.removeAttribute("data-vz-retro");
    n.removeAttribute("data-vz-page");
  });
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
  if (!row || !row.parentElement || !settings().page) return clear(doc);
  if (!cache.has(appid)) {
    cache.set(appid, null);
    load(appid);
  }
  const data = cache.get(appid);
  if (!data) return;
  if (!doc.getElementById(STYLE)) {
    const style = doc.createElement("style");
    style.id = STYLE;
    style.textContent = css();
    doc.head.appendChild(style);
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
  const html = panelHtml(data);
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
  fitPanel(panel, false);
  // The hint sits on the bottom edge of the first screen: what would run into it steps aside.
  const limit = panel.getBoundingClientRect().top + (parseFloat(panel.style.minHeight) || 0) - HINT;
  const items = Array.from(panel.querySelectorAll<HTMLElement>(".vz-next-item")).reverse();
  for (const item of items) if (item.getBoundingClientRect().bottom > limit) item.style.display = "none";
  const desc = panel.querySelector(".vz-desc") as HTMLElement | null;
  if (desc) {
    let lines = Number(desc.style.getPropertyValue("-webkit-line-clamp")) || 1;
    while (lines > 1 && desc.getBoundingClientRect().bottom > limit) {
      desc.style.setProperty("-webkit-line-clamp", String(--lines));
    }
  }
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
  const timer = setInterval(tick, 400);
  return () => {
    clearInterval(timer);
    listeners.delete(tick);
    clear(safe(() => SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow.document, undefined as any));
  };
}
