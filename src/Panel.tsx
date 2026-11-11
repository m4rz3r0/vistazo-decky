import { lang, num, t } from "./i18n";
import { GemShape } from "./gem";
import { Focusable, Navigation, appDetailsClasses } from "@decky/ui";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AchievementSummary,
  ProtonTier,
  cachedAchievements,
  cachedProton,
  getFacts,
  medal,
  loadAchievements,
  loadProton,
} from "./data";
import { useSettings } from "./settings";
import { pageCss } from "./styles";

type Tone = "good" | "ok" | "bad" | "muted";

// Valve's own Deck compatibility colours and wording.
const DECK: Record<number, { text: string; tone: Tone } | undefined> = {
  3: { text: t.deckVerified, tone: "good" },
  2: { text: t.deckPlayable, tone: "ok" },
  1: { text: t.deckUnsupported, tone: "bad" },
};

// ProtonDB tier names; each tier keeps the colour ProtonDB uses for it.
const PROTON: Record<ProtonTier, string> = {
  native: t.tierNative,
  platinum: t.tierPlatinum,
  gold: t.tierGold,
  silver: t.tierSilver,
  bronze: t.tierBronze,
  borked: t.tierBorked,
  pending: t.tierPending,
};

function DeckIcon({ tone }: { tone: Tone }) {
  return (
    <svg className="vz-badge-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="8" className="vz-deck-disc" />
      {tone === "good" && (
        <path d="M4.4 8.3l2.4 2.4 4.8-5" className="vz-deck-mark" />
      )}
      {tone === "ok" && (
        <>
          <circle cx="8" cy="4.6" r="1.1" className="vz-deck-dot" />
          <path d="M8 7.2v4.6" className="vz-deck-mark" />
        </>
      )}
      {tone === "bad" && (
        <path d="M4.8 11.2l6.4-6.4" className="vz-deck-mark" />
      )}
    </svg>
  );
}

// Atom glyph: the symbol associated with Proton, drawn in the tier colour.
function ProtonIcon() {
  return (
    <svg className="vz-badge-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="1.7" className="vz-atom-core" />
      {[0, 60, 120].map((a) => (
        <ellipse
          key={a}
          cx="8"
          cy="8"
          rx="7"
          ry="2.8"
          className="vz-atom-orbit"
          transform={a ? `rotate(${a} 8 8)` : undefined}
        />
      ))}
    </svg>
  );
}

const footerReserve = 44; // Steam's button-hint bar overlays the bottom of the page.
const ad = appDetailsClasses as Record<string, string>;

function formatSize(bytes: number): string | null {
  if (!bytes) return null;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${num(gb, 1)} GB`;
  return `${num(Math.round(bytes / 1024 ** 2))} MB`;
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  return `${num(m / 60, 1)} h`;
}

function pct(n: number): string {
  const v = num(n, n > 0 && n < 10 ? 1 : 0);
  return lang === "es" ? `${v}\u00a0%` : `${v}%`; // Spanish spaces the sign, never splitting the line
}

// Progress ring: 54px, 5px stroke. The share sits in the middle; the count goes beside it.
// All achievements: the ring closes in platinum around a cut gem, the one thing on the page that
// only a finished game gets.
function Ring({ share }: { share: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const done = share >= 100;
  return (
    <svg className="vz-ring" viewBox="0 0 54 54" aria-hidden="true">
      <circle cx="27" cy="27" r={r} className="vz-ring-track" />
      {share > 0 && (
        <circle
          cx="27"
          cy="27"
          r={r}
          className="vz-ring-fill"
          strokeDasharray={`${(c * Math.min(100, share)) / 100} ${c}`}
          transform="rotate(-90 27 27)"
        />
      )}
      {done ? (
        <g className="vz-ring-gem" transform="translate(10.2 10.2) scale(1.4)">
          <GemShape />
        </g>
      ) : (
        <text
          x="27"
          y="27"
          className="vz-ring-text"
          dominantBaseline="central"
          textAnchor="middle"
        >
          {pct(Math.floor(share))}
        </text>
      )}
    </svg>
  );
}

const pageOf = (el: HTMLElement) =>
  el.closest(`.${ad.ScrollContainer}`) as HTMLElement | null;

// The panel fills the first screen exactly, whatever rows Steam adds above (family library, cloud…):
// the page is that one screen, with nothing below it to scroll to.
// Returns whether the description doesn't fit (so it can be opened to read it whole).
function fitPanel(el: HTMLElement, open: boolean): boolean {
  const page = pageOf(el);
  if (!page) return open;
  const top =
    el.getBoundingClientRect().top -
    page.getBoundingClientRect().top +
    page.scrollTop;
  const height = Math.max(0, page.clientHeight - top - footerReserve);
  el.style.minHeight = `${height}px`;
  // The "up next" achievements that would run past the screen step aside (a row Steam adds above,
  // such as the family library notice, takes the room of one); the list goes when none fits.
  const list = el.querySelector(".vz-next") as HTMLElement | null;
  if (list) {
    list.style.removeProperty("display");
    const items = Array.from(list.querySelectorAll<HTMLElement>(".vz-next-item"));
    for (const item of items) item.style.removeProperty("display");
    const limit = el.getBoundingClientRect().top + height;
    let shown = items.length;
    for (const item of items) {
      if (item.getBoundingClientRect().bottom > limit + 1) {
        item.style.display = "none";
        shown--;
      }
    }
    if (items.length && !shown) list.style.display = "none";
  }
  // As many description lines as the screen has room for (1 to 6), never a half-cut line.
  const desc = el.querySelector(".vz-desc") as HTMLElement | null;
  if (!desc) return false;
  // Opened to be read whole: no limit, and it stays openable so it can be folded again.
  if (open) {
    desc.style.removeProperty("-webkit-line-clamp");
    return true;
  }
  {
    const line = parseFloat(getComputedStyle(desc).lineHeight) || 20;
    const lines = Math.min(
      6,
      Math.max(1, Math.floor((height - desc.offsetTop - 12) / line)),
    );
    desc.style.setProperty("-webkit-line-clamp", String(lines));
  }
  return desc.scrollHeight - desc.clientHeight > 2;
}

// The page and the panel's parent get marker attributes, so the page CSS needs no :has() lookups.
// Attributes, not classes: Steam rewrites those elements' class lists as focus moves.
function markPage(el: HTMLElement, on: boolean) {
  const page = pageOf(el);
  page?.toggleAttribute("data-vz-page", on);
  el.parentElement?.toggleAttribute("data-vz-host", on);
}

export const Panel = memo(function Panel({ appid }: { appid: number }) {
  const [ach, setAch] = useState<AchievementSummary | null | undefined>(
    cachedAchievements(appid),
  );
  const [achFailed, setAchFailed] = useState(false);
  const [proton, setProton] = useState<ProtonTier | null | undefined>(
    cachedProton(appid),
  );
  const { protondb } = useSettings();
  const facts = getFacts(appid);
  const root = useRef<HTMLDivElement>(null);
  // The description shows as many lines as fit. When some are left out it can be opened in place
  // to read it whole, and folded again.
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const fit = (el: HTMLElement) => setClipped(fitPanel(el, openRef.current));

  // Re-fit when what we show changes (achievements and ProtonDB arrive later) and when the page resizes.
  useLayoutEffect(() => {
    if (!root.current) return;
    markPage(root.current, true);
    fit(root.current);
  }, [ach, achFailed, proton, protondb, open]);
  // Opened, the panel grows past the first screen: scroll just enough to show all of it above
  // Steam's button hints, and go back to where the page was when it is folded again.
  const scrolledFrom = useRef<number | null>(null);
  useEffect(() => {
    const el = root.current;
    const page = el && pageOf(el);
    if (!el || !page) return;
    if (open) {
      const over =
        el.getBoundingClientRect().bottom - (page.getBoundingClientRect().bottom - footerReserve);
      if (over > 0) {
        scrolledFrom.current = page.scrollTop;
        page.scrollBy({ top: over, behavior: "smooth" });
      }
    } else if (scrolledFrom.current !== null) {
      page.scrollTo({ top: scrolledFrom.current, behavior: "smooth" });
      scrolledFrom.current = null;
    }
  }, [open]);
  useLayoutEffect(() => {
    const el = root.current;
    const page = el && pageOf(el);
    if (!el || !page) return; // the effect above has already marked the page
    const ro = new ResizeObserver(() => fit(el));
    ro.observe(page);
    if (el.parentElement?.firstElementChild)
      ro.observe(el.parentElement.firstElementChild);
    return () => {
      ro.disconnect();
      markPage(el, false);
    };
  }, []);


  // A failed refresh keeps what is already on screen.
  useEffect(() => {
    let alive = true;
    loadAchievements(appid).then((a) => {
      if (!alive) return;
      if (a !== undefined) setAch(a);
      setAchFailed(a === undefined && cachedAchievements(appid) === undefined);
    });
    return () => {
      alive = false;
    };
  }, [appid]);

  useEffect(() => {
    let alive = true;
    if (protondb && cachedProton(appid) === undefined)
      loadProton(appid).then((p) => alive && setProton(p));
    return () => {
      alive = false;
    };
  }, [appid, protondb]);

  if (!facts) return null;
  const deck = DECK[facts.deckCompat];
  const size = formatSize(facts.sizeBytes);
  const share = ach && ach.total ? (ach.achieved / ach.total) * 100 : 0;

  // What to go for next: the ones that say what to do. Hidden ones tell the player nothing, so
  // when they are all that is left a line says so instead of a row of blank tiles.
  const next = ach ? ach.next.filter((a) => !a.hidden) : [];
  const left = ach ? ach.total - ach.achieved : 0;
  const cells: { label: string; value: any }[] = [];
  if (facts.tags.length) cells.push({ label: t.genre, value: facts.tags.join(", ") });
  if (facts.year) cells.push({ label: t.year, value: facts.year });
  if (size) cells.push({ label: t.onDisk, value: size });
  if (facts.minutesTwoWeeks > 0)
    cells.push({ label: t.lastTwoWeeks, value: formatMinutes(facts.minutesTwoWeeks) });
  if (deck)
    cells.push({
      label: "Steam Deck",
      value: (
        <span className={`vz-badge vz-deck vz-${deck.tone}`}>
          <DeckIcon tone={deck.tone} />
          {deck.text}
        </span>
      ),
    });
  if (protondb && proton)
    cells.push({
      label: "ProtonDB",
      value: (
        <span className={`vz-badge vz-proton vz-tier-${proton}`}>
          <ProtonIcon />
          {PROTON[proton]}
        </span>
      ),
    });

  // Two columns: the player's achievements on the left, the game on the right. A game without
  // achievements gives the whole width to the game.
  return (
    <div className={`vz-root${open ? " vz-reading" : ""}`} ref={root}>
      <style>{pageCss()}</style>

      {/* A row for the gamepad too: right from the achievements reaches the description. */}
      <Focusable className={`vz-cols${ach === null ? " vz-solo" : ""}`} flow-children="row">
        {ach ? (
          <Focusable
            className={`vz-ach vz-${medal(ach.achieved, ach.total) ?? "none"}`}
            noFocusRing
            onActivate={() =>
              Navigation.Navigate(
                `/library/app/${appid}/achievements/my/individual`,
              )
            }
            onOKActionDescription={t.seeAllAchievements}
          >
            <div className="vz-ach-head">
              <Ring share={share} />
              <div className="vz-ach-sum">
                <div className="vz-ach-count">
                  <span className="vz-ach-n">{ach.achieved}</span>
                  <span className="vz-ach-of">/{ach.total}</span>
                </div>
                <div className="vz-ach-label">
                  {ach.achieved === ach.total ? t.platinum : t.achievements}
                </div>
              </div>
            </div>
            {/* Nothing left to point at (all earned, or only hidden ones left): say so, and show
                the earned one fewest players have instead of leaving the column empty. */}
            {next.length === 0 && (
              <div className="vz-ach-note">{left > 0 ? t.hiddenLeft(left) : t.allEarned}</div>
            )}
            {(next.length > 0 || ach.rarest) && (
              <ul className="vz-next">
                <li className="vz-next-cap">
                  <span>{next.length > 0 ? t.upNext : t.rarest}</span>
                  <span>{t.players}</span>
                </li>
                {(next.length > 0 ? next : [ach.rarest!]).map((a) => (
                  <li className="vz-next-item" key={a.id}>
                    {a.image ? (
                      <img className={`vz-icon${a.achieved ? " vz-earned" : ""}`} src={a.image} alt="" />
                    ) : (
                      <span className="vz-icon" />
                    )}
                    <span className="vz-next-name">{a.name}</span>
                    <span className="vz-next-sub">
                      {!a.achieved && a.progress !== null && a.progress > 0
                        ? t.progressSoFar(pct(a.progress * 100))
                        : a.globalPercent > 0
                          ? pct(a.globalPercent)
                          : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Focusable>
        ) : ach === null ? null : (
          <div className="vz-ach vz-ach-quiet">
            {achFailed ? t.achievementsUnavailable : t.loadingAchievements}
          </div>
        )}

        <div className="vz-about">
          <div className="vz-facts">
            {cells.map((c) => (
              <div className="vz-fact" key={c.label}>
                <span className="vz-fact-label">{c.label}</span>
                <span className="vz-fact-value">{c.value}</span>
              </div>
            ))}
          </div>
          {facts.snippet &&
            (clipped || open ? (
              <Focusable
                className="vz-desc-box"
                noFocusRing
                onActivate={() => setOpen((o) => !o)}
                onOKActionDescription={open ? t.readLess : t.readAll}
              >
                <p className={`vz-desc${open ? " vz-open" : ""}`}>{facts.snippet}</p>
              </Focusable>
            ) : (
              <p className="vz-desc">{facts.snippet}</p>
            ))}
          {ach === null && <div className="vz-ach-quiet">{t.noAchievements}</div>}
        </div>
      </Focusable>
    </div>
  );
});
