// Home "Escenario", designed for an OLED screen:
// - True black wherever nothing is being said: black pixels are off, cost nothing and never age.
// - The game art is the only large lit area, kept dim, and it fades to black well before the shelf.
// - No boxes, borders, blur or glow: hierarchy comes from brightness and size alone.
// - One accent (lime, or the Obsidiana theme's colour) marks what is focused; the open shelf is white.
// - Motion only answers the player's input.
import { findClassModule } from "@decky/ui";
import { safe } from "../safe";

// Steam's top bar (clock, battery, search, avatar) gets a black veil, solid under Obsidiana. While the
// home is on screen the veil goes, so the art runs to the top edge and the icons sit on it.
let header: string | null = null;
export function headerCss(): string {
  if (header === null) {
    const cls = safe(
      () => (findClassModule((m: any) => m.Header && m.BatteryIcon && m.CurrentUserAvatar) as any)?.Header,
      "",
    );
    header = cls
      ? `html[data-vh-home] .${cls}::before { background: transparent !important; backdrop-filter: none !important; }`
      : "";
  }
  return header;
}

export const homeCss = `
.vh-root {
  /* Follows the Obsidiana theme's colour when it is installed; lime on its own. */
  --vh-accent: var(--obs-accent, #B8F35A);
  /* 1 = motion on. Obsidiana's "Motion" option sets --obs-motion; without the theme it's on. */
  --vh-motion: var(--obs-motion, 1);
  --vh-text: #ececec;
  --vh-muted: rgba(255, 255, 255, 0.5);
  --vh-dim: rgba(255, 255, 255, 0.3);
  --vh-cover-h: 150px;
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #000;
  color: var(--vh-text);
}
.vh-stage {
  position: absolute;
  inset: 0 0 34% 0;
  overflow: hidden;
}
.vh-hero {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  /* The art is the life of the screen: near full brightness so the OLED shows its colour. The
     gradients below keep the text readable where it sits, not everywhere. */
  filter: brightness(0.86) saturate(1.08);
}
.vh-enter {
  animation: vh-rise calc(320ms * var(--vh-motion)) cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes vh-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
/* L1/R1: the next shelf comes in from the side the player pressed. */
.vh-row.vh-from-right { animation: vh-from-right calc(260ms * var(--vh-motion)) cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.vh-row.vh-from-left { animation: vh-from-left calc(260ms * var(--vh-motion)) cubic-bezier(0.2, 0.8, 0.2, 1) both; }
@keyframes vh-from-right {
  from { opacity: 0; transform: translateX(48px); }
  to { opacity: 1; transform: none; }
}
@keyframes vh-from-left {
  from { opacity: 0; transform: translateX(-48px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .vh-root { --vh-motion: 0; }
}
/* A new game's art and logo fade in once loaded: quick enough to keep the speed, no hard cut. */
.vh-hero, .vh-logo { opacity: 0; transition: opacity 0.3s ease-out; }
.vh-hero[data-ready], .vh-logo[data-ready] { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .vh-hero, .vh-logo { transition: none; } }
/* A game with no wide art of its own: its cover, large and sharp on the right, fading into the
   black on the left (a mask, not a blur). */
.vh-hero.vh-poster {
  left: auto;
  right: 0;
  width: 64%;
  object-position: 50% 22%;
  filter: brightness(0.82);
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 52%);
  mask-image: linear-gradient(to right, transparent 0, #000 52%);
}
.vh-fade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to right, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.62) 32%, rgba(0, 0, 0, 0) 58%),
    linear-gradient(to bottom, rgba(0, 0, 0, 0) 45%, #000 100%),
    /* Steam's clock, battery and avatar sit on the art: a soft shade at the very top keeps them
       readable without bringing back a bar. */
    linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0, rgba(0, 0, 0, 0) 72px);
}

.vh-title {
  position: absolute;
  left: 28px;
  bottom: calc(var(--vh-cover-h) + 142px);
  max-width: 52%; /* inside the dark side of the fade, which ends at 58 % */
}
.vh-logo {
  display: block;
  max-width: 280px;
  max-height: 96px;
  object-fit: contain;
  object-position: left bottom;
}
.vh-name {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
}
.vh-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 10px;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.66); /* over bright art, not just black: a step above --vh-muted */
}
.vh-meta span:first-child { color: var(--vh-text); }
/* State colours, the same everywhere in Obsidiana: mint = playing, gold = achievements. */
.vh-meta span.vh-playing { color: var(--obs-ingame, #5fd8a0); font-weight: 600; }
.vh-meta span.vh-playing::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 50%;
  background: currentColor;
  vertical-align: 2px;
}
/* Achievements by medal: bronze up to a third, silver up to two thirds, gold beyond, platinum when
   all are earned (with its gem). Fixed colors, the same in every theme hue. */
.vh-meta span.vh-bronze { color: #e39463; }
.vh-meta span.vh-silver { color: #b9c7d8; }
.vh-meta span.vh-gold { color: var(--obs-reward, #f5cf5a); }
/* A solid dot in the medal's color, like the playing dot: silver next to white text still reads
   as a medal. */
.vh-meta span.vh-bronze::before,
.vh-meta span.vh-silver::before,
.vh-meta span.vh-gold::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 50%;
  background: currentColor;
  vertical-align: 2px;
}
.vh-meta span.vh-platinum { color: #c4ecff; font-weight: 600; }
/* How far the achievements have got, at a glance: a thin line in the medal's color. */
.vh-progress {
  width: 176px;
  height: 3px;
  margin-top: 11px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.5);
  overflow: hidden;
}
.vh-progress i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: currentColor;
  transform-origin: left;
}
.vh-progress.vh-bronze { color: #e39463; }
.vh-progress.vh-silver { color: #b9c7d8; }
.vh-progress.vh-gold { color: var(--obs-reward, #f5cf5a); }
.vh-progress.vh-platinum { color: #c4ecff; }
.vz-gem {
  width: 16px;
  height: 16px;
  margin-right: 7px;
  vertical-align: -2px;
  fill: rgba(196, 236, 255, 0.18);
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linejoin: round;
}

/* Shelves: plain words. The active one is lime, the rest recede; L1/R1 are quiet hints. */
.vh-shelves {
  position: absolute;
  left: 28px;
  bottom: calc(var(--vh-cover-h) + 100px);
  display: flex;
  align-items: baseline;
  gap: 18px;
  font-size: 15px;
  font-weight: 600;
}
.vh-shelf { color: var(--vh-dim); }
.vh-shelf.vh-on { color: var(--vh-text); }
.vh-glyph {
  font-size: 13px;
  font-weight: 700;
  color: var(--vh-dim);
}

/* Covers. "Protagonist": the chosen game steps forward at full light, the rest stay smaller and
   in the half-light. Only transform and opacity change, so the GPU composes it without laying the
   shelf out again on every frame.
   Sizes: a resting cover is 0.9, the chosen one 1.16 (W = cover width). The layout gap is the
   visual gap minus the 0.1 W a resting pair loses, and the covers around the chosen one slide
   out by its growth plus their shrink on that side, 0.08 W + 0.05 W, so every visible gap stays
   14 px. With motion off nothing scales or slides and the gap is a plain 14 px. */
.vh-row {
  --vh-w: calc(var(--vh-cover-h) * 2 / 3);
  --vh-rest: calc(1 - 0.1 * var(--vh-motion));
  --vh-shift: calc(var(--vh-w) * 0.13 * var(--vh-motion));
  position: absolute;
  left: 0;
  right: 0;
  bottom: 46px;
  display: flex;
  gap: calc(14px - var(--vh-w) * 0.1 * var(--vh-motion));
  /* Left: a chosen first cover grows 0.08 W, a resting one ends 0.08 W in: both meet 28 px. */
  padding: 20px calc(28px + var(--vh-w) * 0.08 * var(--vh-motion)) 22px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.vh-row::-webkit-scrollbar { display: none; }
.vh-cover {
  position: relative;
  flex: none;
  width: var(--vh-w);
  height: var(--vh-cover-h);
  border-radius: 12px;
  background: #000;
  outline: none;
  /* Resting covers, and every cover before the chosen one, slide left by the same amount. */
  transform: translateX(calc(-1 * var(--vh-shift))) scale(var(--vh-rest));
  transition: transform calc(220ms * var(--vh-motion)) cubic-bezier(0.2, 0.8, 0.2, 1);
}
/* Covers that aren't chosen go darker, not see-through: a shade over the art, so the hero behind
   never shows through them. Only the shade's opacity changes (no filter pass). */
.vh-cover::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: #000;
  opacity: 0.3;
  pointer-events: none;
  transition: opacity calc(220ms * var(--vh-motion)) ease-out;
}
.vh-row .vh-cover.gpfocus {
  transform: scale(calc(1 + 0.16 * var(--vh-motion)));
  z-index: 1;
}
.vh-row .vh-cover.gpfocus::after { opacity: 0; }
.vh-row .vh-cover.gpfocus ~ .vh-cover {
  transform: translateX(var(--vh-shift)) scale(var(--vh-rest));
}
/* While the shelf has the focus the others step further back. With motion off light is the only
   cue, so they go darker still. */
.vh-row:has(.vh-cover.gpfocus) .vh-cover:not(.gpfocus)::after {
  opacity: calc(0.62 - 0.1 * var(--vh-motion));
}
.vh-row .vh-cover.vh-library::after { content: none; }
@media (prefers-reduced-motion: reduce) {
  .vh-row { --vh-motion: 0; }
}
.vh-art {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
  overflow: hidden;
}
.vh-noart {
  box-sizing: border-box;
  border-radius: 12px;
  display: flex;
  align-items: flex-end;
  padding: 10px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--vh-muted);
}
.vh-library {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  box-sizing: border-box;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--vh-muted);
}
.vh-library.gpfocus { color: var(--vh-text); }
.vh-lib-icon {
  width: 28px;
  height: 28px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linejoin: round;
}
.vh-library.gpfocus .vh-lib-icon { stroke: var(--vh-accent); }
.vh-empty {
  align-self: center;
  padding: 0 12px;
  color: var(--vh-muted);
  font-size: 16px;
}

/* Friends, top-left: my status as a solid dot, then how many friends are online. It sits on the
   same line as Steam's status icons on the right (centred 20 px from the top, 18 px icons, 16 px
   text), so the top edge reads as one bar of status without a bar behind it. */
.vh-friends {
  position: absolute;
  top: 6px;
  left: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  margin-left: -10px;
  padding: 0 12px 0 10px;
  border-radius: 14px;
  color: var(--vh-muted);
  outline: none;
  z-index: 5;
  transition: background-color calc(160ms * var(--vh-motion)) ease-out;
}
/* Selected: the theme's tinted surface, the same focus as a settings row. */
.vh-friends.gpfocus {
  color: var(--vh-text);
  background: rgba(var(--obs-accent-rgb, 184, 243, 90), 0.16);
}
.vh-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
  background: var(--vh-tone);
}
.vh-people {
  width: 18px;
  height: 18px;
  margin-left: 4px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.vh-friends.gpfocus .vh-people { stroke: var(--vh-accent); }
.vh-online {
  font-size: 16px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.vh-status-label {
  display: none;
  font-size: 16px;
}
.vh-friends.gpfocus .vh-status-label { display: inline; }
.vh-menu-row {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}
.vh-menu-now {
  font-size: 14px;
  opacity: 0.6;
}
`;
