// Home "Escenario", designed for an OLED screen:
// - True black wherever nothing is being said: black pixels are off, cost nothing and never age.
// - The game art is the only large lit area, kept dim, and it fades to black well before the shelf.
// - No boxes, borders, blur or glow: hierarchy comes from brightness and size alone.
// - One accent (lime, or the Obsidiana theme's colour) marks what is focused; the open shelf is white.
// - Motion only answers the player's input.
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
  filter: brightness(0.62);
}
/* A new game's art and logo fade in once loaded: quick enough to keep the speed, no hard cut. */
.vh-hero, .vh-logo { opacity: 0; transition: opacity 0.3s ease-out; }
.vh-hero[data-ready], .vh-logo[data-ready] { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .vh-hero, .vh-logo { transition: none; } }
.vh-fade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to right, #000 0%, rgba(0, 0, 0, 0.55) 30%, rgba(0, 0, 0, 0) 60%),
    linear-gradient(to bottom, rgba(0, 0, 0, 0) 45%, #000 100%);
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
  color: var(--vh-muted);
}
.vh-meta span:first-child { color: var(--vh-text); }

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
  padding: 14px 28px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.vh-row::-webkit-scrollbar { display: none; }
.vh-cover {
  position: relative;
  flex: none;
  width: calc(var(--vh-cover-h) * 2 / 3);
  height: var(--vh-cover-h);
  border-radius: 12px;
  overflow: hidden;
  background: #000;
  outline: none;
}
.vh-cover.gpfocus {
  box-shadow: 0 0 0 1.5px var(--vh-accent);
  /* The focused cover grows 4 %, the same as Steam's covers under Obsidiana. */
  transform: scale(calc(1 + 0.04 * var(--vh-motion)));
  z-index: 1;
}
.vh-cover {
  transition: transform calc(180ms * var(--vh-motion)) cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity calc(180ms * var(--vh-motion)) ease-out;
}
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
}
.vh-noart {
  box-sizing: border-box;
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
