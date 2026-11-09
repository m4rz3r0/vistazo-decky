import { lang, num, t } from "./i18n";
import {
  Focusable,
  Navigation,
  appDetailsClasses,
  gamepadTabbedPageClasses,
} from "@decky/ui";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AchievementSummary,
  ProtonTier,
  cachedAchievements,
  cachedProton,
  getFacts,
  loadAchievements,
  loadProton,
} from "./data";
import { useSettings } from "./settings";
import { tabsFiltered } from "./tabs";
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
      <ellipse cx="8" cy="8" rx="7" ry="2.8" className="vz-atom-orbit" />
      <ellipse
        cx="8"
        cy="8"
        rx="7"
        ry="2.8"
        className="vz-atom-orbit"
        transform="rotate(60 8 8)"
      />
      <ellipse
        cx="8"
        cy="8"
        rx="7"
        ry="2.8"
        className="vz-atom-orbit"
        transform="rotate(120 8 8)"
      />
    </svg>
  );
}

// Stacked cards: Steam's "Your stuff" (screenshots, notes, DLC, guides…).
function StuffIcon() {
  return (
    <svg className="vz-stuff-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="9" width="16" height="11" rx="2.5" />
      <path d="M6.5 6h11M9 3h6" />
    </svg>
  );
}

const footerReserve = 44; // Steam's button-hint bar overlays the bottom of the page.
const td = gamepadTabbedPageClasses as Record<string, string>;
const ad = appDetailsClasses as Record<string, string>;

function formatSize(bytes: number): string | null {
  if (!bytes) return null;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1)
    return `${num(gb, 1)} GB`;
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
      <text
        x="27"
        y="27"
        className="vz-ring-text"
        dominantBaseline="central"
        textAnchor="middle"
      >
        {done ? "✓" : `${Math.floor(share)}%`}
      </text>
    </svg>
  );
}

const pageOf = (el: HTMLElement) =>
  el.closest(`.${ad.ScrollContainer}`) as HTMLElement | null;

// The panel fills the first screen exactly, so "Tus cosas" starts below the fold and the corner
// button always sits at the bottom right, whatever rows Steam adds above (family library, cloud…).
function fitPanel(el: HTMLElement) {
  const page = pageOf(el);
  if (!page) return;
  const top =
    el.getBoundingClientRect().top -
    page.getBoundingClientRect().top +
    page.scrollTop;
  const height = Math.max(0, page.clientHeight - top - footerReserve);
  el.style.minHeight = `${height}px`;
  // As many description lines as the screen has room for (1 to 4), never a half-cut line.
  const desc = el.querySelector(".vz-desc") as HTMLElement | null;
  if (desc) {
    const line = parseFloat(getComputedStyle(desc).lineHeight) || 20;
    const lines = Math.min(
      4,
      Math.max(1, Math.floor((height - desc.offsetTop - 12) / line)),
    );
    desc.style.setProperty("-webkit-line-clamp", String(lines));
  }
}

// The page and the panel's parent get marker attributes, so the page CSS needs no :has() lookups.
// Attributes, not classes: Steam rewrites those elements' class lists as focus moves.
function mark(node: Element | null | undefined, name: string, on: boolean) {
  if (!node) return;
  if (on) node.setAttribute(name, "");
  else node.removeAttribute(name);
}
function markPage(el: HTMLElement, on: boolean) {
  const page = pageOf(el);
  mark(page, "data-vz-page", on);
  mark(page, "data-vz-tabs-hidden", on && tabsFiltered());
  mark(el.parentElement, "data-vz-host", on);
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

  // Re-fit when what we show changes (achievements and ProtonDB arrive later) and when the page resizes.
  useLayoutEffect(() => {
    if (!root.current) return;
    markPage(root.current, true);
    fitPanel(root.current);
  }, [ach, achFailed, proton, protondb]);
  useLayoutEffect(() => {
    const el = root.current;
    const page = el && pageOf(el);
    if (!el || !page) return;
    markPage(el, true);
    const ro = new ResizeObserver(() => fitPanel(el));
    ro.observe(page);
    if (el.parentElement?.firstElementChild)
      ro.observe(el.parentElement.firstElementChild);
    return () => {
      ro.disconnect();
      markPage(el, false);
    };
  }, []);

  const openStuff = () => {
    const page = root.current && pageOf(root.current);
    const target = page?.querySelector(
      `.${td.TabContents}`,
    ) as HTMLElement | null;
    if (!target) return;
    // Hand the focus to the first control in "Tus cosas", then bring the section's top into view.
    (target.querySelector("[tabindex]") as HTMLElement | null)?.focus({
      preventScroll: true,
    });
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    let alive = true;
    loadAchievements(appid).then((a) => {
      if (!alive) return;
      setAch(a);
      setAchFailed(a === undefined);
    });
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

  return (
    <div className="vz-root" ref={root}>
      <style>{pageCss()}</style>

      {ach ? (
        <Focusable
          className="vz-ach"
          noFocusRing
          onActivate={() =>
            Navigation.Navigate(
              `/library/app/${appid}/achievements/my/individual`,
            )
          }
          onOKActionDescription={t.seeAllAchievements}
        >
          <Ring share={share} />
          <div className="vz-ach-sum">
            <div className="vz-ach-count">
              <span className="vz-ach-n">{ach.achieved}</span>
              <span className="vz-ach-of">/{ach.total}</span>
            </div>
            <div className="vz-ach-label">
              {ach.achieved === ach.total ? t.allAchievements : t.achievements}
            </div>
          </div>
          {ach.next.length > 0 && (
            <ul className="vz-next">
              {ach.next.map((a) => (
                <li className="vz-next-item" key={a.id}>
                  {a.image ? (
                    <img className="vz-icon" src={a.image} alt="" />
                  ) : (
                    <span className="vz-icon" />
                  )}
                  <span className="vz-next-text">
                    <span className="vz-next-name">{a.name}</span>
                    <span className="vz-next-sub">
                      {a.progress !== null && a.progress > 0
                        ? t.progressSoFar(pct(a.progress * 100))
                        : a.globalPercent > 0
                          ? t.ofPlayers(pct(a.globalPercent))
                          : a.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Focusable>
      ) : (
        <div className="vz-ach vz-ach-quiet">
          {ach === null
            ? t.noAchievements
            : achFailed
              ? t.achievementsUnavailable
              : t.loadingAchievements}
        </div>
      )}

      <div className="vz-meta">
        {facts.tags.length > 0 && (
          <span className="vz-tags">{facts.tags.join(", ")}</span>
        )}
        {facts.year && <span className="vz-fact">{facts.year}</span>}
        {size && <span className="vz-fact">{size}</span>}
        {facts.minutesTwoWeeks > 0 && (
          <span className="vz-fact">
            {t.lastTwoWeeks(formatMinutes(facts.minutesTwoWeeks))}
          </span>
        )}
        <span className="vz-badges">
          {deck && (
            <span className={`vz-badge vz-deck vz-${deck.tone}`}>
              <DeckIcon tone={deck.tone} />
              <span className="vz-badge-src">Deck</span>
              {deck.text}
            </span>
          )}
          {protondb && proton && (
            <span className={`vz-badge vz-proton vz-tier-${proton}`}>
              <ProtonIcon />
              <span className="vz-badge-src">ProtonDB</span>
              {PROTON[proton]}
            </span>
          )}
        </span>
      </div>

      {facts.snippet && <p className="vz-desc">{facts.snippet}</p>}

      <Focusable
        className="vz-stuff"
        noFocusRing
        onActivate={openStuff}
        onOKActionDescription={t.seeYourStuff}
        aria-label={t.yourStuff}
      >
        <span className="vz-stuff-label">{t.yourStuff}</span>
        <StuffIcon />
      </Focusable>
    </div>
  );
});
