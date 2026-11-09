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
      ? `html:has(.vh-root) .${cls}::before { background: transparent !important; backdrop-filter: none !important; }`
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
/* A new game's art settles into place: it starts a touch closer and eases back. Answers the
   player's move along the shelf; nothing moves on its own. */
.vh-hero[data-ready] {
  animation: vh-settle calc(900ms * var(--vh-motion)) cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes vh-settle {
  from { transform: scale(1.045); }
  to { transform: scale(1); }
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
  bottom: calc(var(--vh-cover-h) + 120px);
  max-width: 46%;
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
.vh-meta span.vh-reward { color: var(--obs-reward, #f5cf5a); }

/* Shelves: plain words. The active one is lime, the rest recede; L1/R1 are quiet hints. */
.vh-shelves {
  position: absolute;
  left: 28px;
  bottom: calc(var(--vh-cover-h) + 80px);
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

/* Covers: the art is the object; focus is a thin accent line, nothing else moves. */
.vh-row {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 46px;
  display: flex;
  gap: 14px;
  padding: 18px 28px 24px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  /* A shallow perspective: the covers lean towards the one you're on, like a shelf seen in a room. */
  perspective: 900px;
}
.vh-row::-webkit-scrollbar { display: none; }
.vh-cover {
  --vh-tilt: 0deg;
  position: relative;
  flex: none;
  width: calc(var(--vh-cover-h) * 2 / 3);
  height: var(--vh-cover-h);
  border-radius: 12px;
  background: #000;
  outline: none;
  transform: rotateY(var(--vh-tilt));
  transform-origin: center center;
  transition: transform calc(240ms * var(--vh-motion)) cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity calc(240ms * var(--vh-motion)) ease-out;
}
/* While the shelf has the focus, covers before the selected one lean right and those after lean
   left: all of them turn a little towards the game you're on. */
.vh-row:has(.vh-cover.gpfocus) .vh-cover { --vh-tilt: 12deg; }
.vh-row .vh-cover.gpfocus ~ .vh-cover { --vh-tilt: -12deg; }
/* The selected cover faces you, steps forward and gets the theme's mark: a short bar of the accent
   under it that opens out as the focus arrives. No frame around the art. */
.vh-row .vh-cover.gpfocus {
  --vh-tilt: 0deg;
  transform: translateY(calc(-6px * var(--vh-motion))) scale(calc(1 + 0.1 * var(--vh-motion)));
  z-index: 1;
}
.vh-cover::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -11px;
  width: 36px;
  height: 4px;
  margin-left: -18px;
  border-radius: 2px;
  background: var(--vh-accent);
  transform: scaleX(0);
  opacity: 0;
  transition: transform calc(240ms * var(--vh-motion)) cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity calc(160ms * var(--vh-motion)) ease-out;
}
.vh-cover.gpfocus::after { transform: scaleX(1); opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .vh-cover { --vh-motion: 0; }
}
/* Only the focused cover is at full brightness; on black, opacity dims for free (no filter pass). */
.vh-cover:not(.gpfocus):not(.vh-library) {
  opacity: 0.72;
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
.vh-library-sub {
  font-size: 13px;
  font-weight: 500;
  color: var(--vh-dim);
}
.vh-empty {
  align-self: center;
  padding: 0 12px;
  color: var(--vh-muted);
  font-size: 16px;
}

/* Friends, top-left: my status as a solid dot, then how many friends are online. */
.vh-friends {
  position: absolute;
  top: 52px;
  left: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 10px 0 0;
  border-radius: 12px;
  color: var(--vh-muted);
  outline: none;
  z-index: 5;
}
.vh-friends.gpfocus { color: var(--vh-text); }
.vh-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
  background: var(--vh-tone);
}
.vh-people {
  width: 20px;
  height: 20px;
  margin-left: 4px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.vh-friends.gpfocus .vh-people { stroke: var(--vh-accent); }
.vh-online {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.vh-status-label {
  display: none;
  font-size: 15px;
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
