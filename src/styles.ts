import { safe } from "./safe";
import {
  appDetailsClasses,
  appDetailsHeaderClasses,
  findClassModule,
  playSectionClasses,
} from "@decky/ui";

// Steam's class names are hashed per build; Decky exposes the current ones by their stable names.
const ad = appDetailsClasses as Record<string, string>;
const hd = appDetailsHeaderClasses as Record<string, string>;
const ps = playSectionClasses as Record<string, string>;
const c = (name: string | undefined) =>
  name ? `.${name}` : ".vz-missing-class";

let cached: string | null = null;

// Everything is scoped to a page that contains our panel, so other pages (and shortcuts handled by
// Tender) keep Steam's own look. Tokens follow the Obsidiana theme.
export function pageCss(): string {
  if (cached) return cached;
  // Panel.tsx marks the page (data-vz-page) and the panel's parent (data-vz-host): plain attributes
  // instead of :has(), which is re-checked on every change.
  const page = `${c(ad.ScrollContainer)}[data-vz-page]`;
  const art = `${page} ${c(hd.HeaderBackgroundImage)}`;
  const busyCloud = [
    ps.CloudSyncProblem,
    ps.CloudSynching,
    ps.CloudStatusSyncFail,
    ps.CloudStatusDownloading,
    ps.CloudStatusUploading,
  ]
    .filter(Boolean)
    .map((n) => `.${n}`)
    .join(", ");

  // Steam's glass backdrop behind the page body: see-through here, but taller than the screen.
  const backdrop = safe(
    () => (findClassModule((m: any) => m.BackdropGlass && m.Backdrop) as any)?.Backdrop as string,
    "",
  );

  cached = `
/* The page is one screen: nothing below it and nothing to scroll to. Steam's backdrop would leave
   it a hundred pixels to scroll into the void. */
${page} ${c(backdrop)} {
  display: none !important;
}

/* Art bleeds behind the first screen: the sharp hero on top, fading to OLED black so the panel reads
   on plain black. Steam's blurred copy of the art is dropped (a full-screen filtered layer for nothing). */
${art} {
  position: absolute !important;
  inset: 0 0 auto 0;
  height: 100vh !important;
  overflow: hidden;
  z-index: 0;
}
${page} ${c(hd.ImgBlur)} {
  display: none !important;
}
${art} ${c(hd.ImgContainer)} {
  position: relative;
  z-index: 1;
  height: auto !important;
  -webkit-mask-image: linear-gradient(to bottom, #000 50%, transparent 100%);
}
${art} ${c(hd.ImgContainer)} img {
  position: relative !important;
  width: 100%;
  height: auto !important;
}
${page} ${c(hd.ImgBlurBackdrop)},
${page} ${c(hd.TopGradient)} {
  display: none !important;
}
${art}::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0) 26%,
    rgba(0, 0, 0, 0.5) 44%,
    rgba(0, 0, 0, 0.86) 64%,
    #000 90%
  );
}
${page} ${c(hd.BoxSizerContainer)} {
  z-index: 3;
}
${page} ${c(ad.AppDetailsOverviewPanel)} {
  position: relative;
  z-index: 1;
}

/* Play bar and body sit directly on the art. */
${page} [data-vz-host] {
  background: transparent !important;
}
${page} [data-vz-host] > :first-child {
  background: transparent !important;
  backdrop-filter: none !important;
  box-shadow: none !important;
}
${page} ${c(ps.MenuButton)},
${page} ${c(ps.ControllerConfigButton)} {
  background: rgba(255, 255, 255, 0.08) !important;
  box-shadow: none !important;
}
/* Focused, Steam turns these two white and their icon dark; the surface above stays dark, so the
   icon stays light too and the focus is the theme's ring. */
${page} ${c(ps.MenuButton)} svg,
${page} ${c(ps.MenuButton)} svg *,
${page} ${c(ps.ControllerConfigButton)} svg,
${page} ${c(ps.ControllerConfigButton)} svg * {
  color: #fff !important;
  fill: #fff !important;
}
${page} ${c(ps.MenuButton)}.gpfocus,
${page} ${c(ps.ControllerConfigButton)}.gpfocus {
  outline: 1.5px solid var(--obs-ring, var(--obs-accent, #B8F35A)) !important;
  outline-offset: 3px !important;
}

/* "From your family library" note: one small quiet line instead of a tall row, with room
   between it and the play bar so it doesn't read as part of the Play button. */
${page} ${c(ps.SharedLibrary)},
${page} ${c(ps.SharedLibrary)} * {
  height: auto !important;
  min-height: 0 !important;
  margin-top: 0 !important;
  font-size: 15px !important;
  line-height: 1.3 !important;
  color: rgba(255, 255, 255, 0.62) !important; /* --vz-muted isn't defined on Steam's page */
}
${page} ${c(ps.SharedLibrary)} {
  margin-top: 12px !important;
}


/* Cloud status only when something needs attention. */
${page} ${c(ps.CloudStatusRow)}${busyCloud ? `:not(:has(${busyCloud}))` : ""} {
  display: none !important;
}

.vz-root {
  /* Follows the Obsidiana theme's colour when it is installed; lime on its own. */
  --vz-accent: var(--obs-accent, #B8F35A);
  --vz-accent-rgb: var(--obs-accent-rgb, 184, 243, 90);
  --vz-reward: var(--obs-reward, #f5cf5a); /* achievements are gold everywhere */
  --vz-text: #f4f4f4;
  --vz-muted: rgba(255, 255, 255, 0.62);
  --vz-faint: rgba(255, 255, 255, 0.14);
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 24px 10px;
  color: var(--vz-text);
}

/* Two columns that fill the width: the player's achievements on the left, the game on the right.
   A game without achievements gives the whole width to the game. */
.vz-cols {
  display: grid;
  grid-template-columns: minmax(0, 9fr) minmax(0, 13fr);
  column-gap: 40px;
  align-items: start;
}
.vz-cols.vz-solo { grid-template-columns: minmax(0, 1fr); }

/* Achievements: ring and count, then what to go for next underneath. No box: at rest the ring is
   gold (the achievements color) and the count white; with the focus they light up in the accent,
   the same signal as the home's covers. */
.vz-ach {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 6px 0;
  outline: none;
}
.vz-ach-head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.vz-ach-note {
  font-size: 15px;
  line-height: 1.4;
  color: var(--vz-muted);
}
/* The ring takes the medal the game has reached: bronze up to a third, silver up to two thirds,
   gold beyond, platinum with every achievement (and the gem by the label). */
.vz-ach.vz-bronze { --vz-reward: #e39463; }
.vz-ach.vz-silver { --vz-reward: #b9c7d8; }
.vz-ach.vz-platinum { --vz-reward: #c4ecff; }
.vz-ach.vz-platinum .vz-ach-label { color: var(--vz-reward); font-weight: 600; }
.vz-ring-gem {
  fill: rgba(196, 236, 255, 0.2);
  stroke: var(--vz-reward);
  stroke-width: 1.15;
  stroke-linejoin: round;
}
.vz-ach.vz-platinum .vz-ring-track { stroke: rgba(196, 236, 255, 0.16); }
.vz-ach.gpfocus .vz-ring-gem { stroke: var(--vz-accent); }
.vz-ach.gpfocus .vz-ring-fill { stroke: var(--vz-accent); }
.vz-ach.gpfocus .vz-ach-n,
.vz-ach.gpfocus .vz-ach-label { color: var(--vz-accent); }
.vz-ach-quiet {
  color: var(--vz-muted);
  font-size: 16px;
}
.vz-ring {
  width: 62px;
  height: 62px;
  flex: none;
}
.vz-ring-track {
  fill: none;
  stroke: var(--vz-faint);
  stroke-width: 5;
}
.vz-ring-fill {
  fill: none;
  stroke: var(--vz-reward);
  stroke-width: 5;
  stroke-linecap: round;
}
.vz-ring-text {
  fill: var(--vz-text);
  font-size: 13px;
  font-weight: 700;
}
.vz-ach-sum {
  flex: none;
  min-width: 74px;
}
.vz-ach-count {
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.vz-ach-n {
  font-size: 28px;
  font-weight: 800;
  color: var(--vz-text);
}
.vz-ach-of {
  font-size: 17px;
  font-weight: 600;
  color: var(--vz-muted);
}
.vz-ach-label {
  margin-top: 3px;
  font-size: 14px;
  color: var(--vz-muted);
}
/* Up next: a short list with the whole name, and how many players have each one. */
.vz-next {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.vz-next-cap {
  display: flex;
  justify-content: space-between;
}
.vz-next-cap,
.vz-fact-label {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
}
.vz-next-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.vz-icon {
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 6px;
  background: #000;
  filter: saturate(0.4);
}
.vz-icon.vz-earned { filter: none; } /* an earned one keeps its color */
.vz-next-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
  font-weight: 600;
}
.vz-next-sub {
  flex: none;
  margin-left: auto;
  padding-left: 8px;
  font-size: 13px;
  color: var(--vz-muted);
  font-variant-numeric: tabular-nums;
}

/* The game: its facts, each under its own label (the way Steam shows "Last played" above), then
   the pitch. */
.vz-about {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding-top: 6px;
}
.vz-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, auto));
  justify-content: space-between;
  column-gap: 24px;
  row-gap: 12px;
}
.vz-solo .vz-facts {
  grid-template-columns: repeat(6, minmax(0, auto));
  justify-content: start;
  column-gap: 40px;
}
.vz-fact {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.vz-fact-value {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
/* Verdicts: the symbol and the word in their own colour, no box around them. */
.vz-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--vz-tone);
}
.vz-badge-icon {
  width: 16px;
  height: 16px;
  flex: none;
}
/* Steam Deck compatibility, Valve's palette. */
.vz-deck.vz-good { --vz-tone: #59bf40; }
.vz-deck.vz-ok { --vz-tone: #ffc82c; }
.vz-deck.vz-bad { --vz-tone: #a3a3a3; }
.vz-deck-disc { fill: var(--vz-tone); }
.vz-deck-mark {
  fill: none;
  stroke: #0a0a0a;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.vz-deck-dot { fill: #0a0a0a; }
/* ProtonDB tiers, ProtonDB's palette. */
.vz-tier-platinum { --vz-tone: #b4c7dc; }
.vz-tier-gold { --vz-tone: #cfb53b; }
.vz-tier-silver { --vz-tone: #a6a6a6; }
.vz-tier-bronze { --vz-tone: #cd7f32; }
.vz-tier-borked { --vz-tone: #ff4d4d; }
.vz-tier-native { --vz-tone: #59bf40; }
.vz-tier-pending { --vz-tone: var(--vz-muted); }
.vz-atom-core { fill: var(--vz-tone); }
.vz-atom-orbit {
  fill: none;
  stroke: var(--vz-tone);
  stroke-width: 1.2;
}

/* Focus is a fine ring in the theme's tone, a little apart from the element (the same as the
   Obsidiana theme draws everywhere else); the text stays white. With motion on it fades in while
   closing onto the element. The focused rule sets the whole outline again, not just its color:
   Steam's own "div:focus { outline: none }" outranks the resting rule. */
.vz-desc-box {
  outline: 1.5px solid transparent;
  outline-offset: 4px;
  transition: outline-color calc(160ms * var(--obs-motion, 0)) ease-out,
    outline-offset calc(200ms * var(--obs-motion, 0)) cubic-bezier(0.2, 0.8, 0.2, 1);
}
/* A description that doesn't fit can be chosen and opened in place. The box bleeds a little past
   the text so the text itself stays aligned with the facts above. */
.vz-desc-box {
  margin: -6px -10px;
  padding: 6px 10px;
  border-radius: 12px;
}
/* Opened, the text may run under Steam's button hints: room below, so the page can scroll it clear. */
.vz-root.vz-reading { margin-bottom: 44px; }
/* The box already stands clear of the text, so its ring sits on the box's own edge. */
.vz-desc-box.gpfocus {
  outline: 1.5px solid var(--obs-ring, var(--vz-accent));
  outline-offset: 0;
}
.vz-desc-box.gpfocus .vz-desc { color: var(--vz-text); }
.vz-desc.vz-open {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}
.vz-desc {
  margin: 0;
  font-size: 15px;
  line-height: 1.45;
  color: var(--vz-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
`;
  return cached;
}
