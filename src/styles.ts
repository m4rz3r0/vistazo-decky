import {
  appDetailsClasses,
  appDetailsHeaderClasses,
  gamepadTabbedPageClasses,
  playSectionClasses,
} from "@decky/ui";

// Steam's class names are hashed per build; Decky exposes the current ones by their stable names.
const ad = appDetailsClasses as Record<string, string>;
const hd = appDetailsHeaderClasses as Record<string, string>;
const ps = playSectionClasses as Record<string, string>;
const tp = gamepadTabbedPageClasses as Record<string, string>;
const c = (name: string | undefined) =>
  name ? `.${name}` : ".vz-missing-class";

let cached: string | null = null;

// Everything is scoped to a page that contains our panel, so other pages (and shortcuts handled by
// Tender) keep Steam's own look. Tokens follow the Obsidiana theme.
export function pageCss(): string {
  if (cached) return cached;
  // Panel.tsx marks the page (data-vz-page), the panel's parent (data-vz-host) and, when the tab filter
  // worked, data-vz-tabs-hidden: plain attributes instead of :has(), which is re-checked on every change.
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

  cached = `
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

/* Steam's tab strip (only "Tus cosas" is left) gives way to the panel's corner button. */
${c(ad.ScrollContainer)}[data-vz-tabs-hidden] ${c(tp.TabHeaderRowWrapper)} {
  display: none !important;
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

/* Achievements: ring, count, then what to go for next. No box: at rest the ring is gold (the
   achievements color) and the count white; with the focus they light up in the accent, the same
   signal as the home's covers. */
.vz-ach {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 0;
  outline: none;
}
.vz-ach.gpfocus .vz-ring-fill { stroke: var(--vz-accent); }
.vz-ach.gpfocus .vz-ach-n,
.vz-ach.gpfocus .vz-ach-label { color: var(--vz-accent); }
.vz-ach-quiet {
  color: var(--vz-muted);
  font-size: 16px;
}
.vz-ring {
  width: 54px;
  height: 54px;
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
.vz-next {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 0;
  padding: 0 0 0 12px;
  list-style: none;
}
.vz-next-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.vz-icon {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 6px;
  background: #000;
  filter: saturate(0.4);
}
.vz-next-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.vz-next-name,
.vz-next-sub {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vz-next-name {
  font-size: 16px;
  font-weight: 700;
}
.vz-next-sub {
  font-size: 14px;
  color: var(--vz-muted);
}

/* One line of facts, then the pitch. */
.vz-meta {
  display: flex;
  align-items: baseline;
  gap: 14px;
  white-space: nowrap;
  font-size: 16px;
}
.vz-tags {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}
.vz-fact {
  flex: none;
  color: var(--vz-muted);
  font-variant-numeric: tabular-nums;
}
.vz-badges {
  display: flex;
  gap: 18px;
  margin-left: auto;
  flex: none;
}
/* Verdicts: the symbol and the word in their own colour, no box around them. */
.vz-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 700;
  color: var(--vz-tone);
}
.vz-badge-icon {
  width: 16px;
  height: 16px;
  flex: none;
}
.vz-badge-src {
  font-weight: 500;
  color: var(--vz-muted);
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

/* "Tus cosas": icon button in the bottom-right corner of the first screen. The label appears on focus. */
.vz-stuff {
  position: absolute;
  right: 24px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 9px;
  border-radius: 12px;
  color: var(--vz-muted);
  outline: none;
}
.vz-stuff.gpfocus {
  color: var(--vz-accent);
  background: rgba(var(--vz-accent-rgb), 0.16);
}
.vz-stuff-label {
  display: none;
  padding-left: 5px;
  font-size: 16px;
  font-weight: 700;
}
.vz-stuff.gpfocus .vz-stuff-label { display: inline; }
.vz-stuff-icon {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.vz-desc {
  margin: 0;
  max-width: min(72ch, calc(100% - 64px));
  font-size: 15.5px;
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
