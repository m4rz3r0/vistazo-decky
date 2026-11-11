#!/usr/bin/env node
// Walks a Steam Deck like a user and checks the Obsidiana theme against what is really on screen.
//
// The theme styles Steam through its internal class names, which change with Steam updates. When one
// is renamed the rule silently stops applying and a screen falls back to Steam's own look. This tool
// tours the interface and reports every theme selector that matched nothing, with its line in the
// source file, and can save a screenshot of each step to compare two versions of the theme.
//
//   DECK=deck@<host> node tools/theme-check.mjs [--shots <dir>] [--json <file>] [--only <part,part>] [--audit]
//
// --audit also looks for dead weight: at every step it switches each declaration off and sees whether
// anything on screen changes. A declaration that matched elements but never changed anything is
// overridden by another rule (or repeats Steam's own value) and is listed as "no effect". While it
// runs the Deck shows the theme without those declarations, so screenshots taken with --shots in the
// same run are a preview of the cleaned theme; the stylesheet is put back at the end.
// It is slower, and only knows the screens and states the tour reaches: review before deleting.
//
// Needs: ssh access to the Deck (key presses go through xdotool there), Steam's debugger reachable at
// $CDP (default http://127.0.0.1:9333, e.g. through `ssh -L 9333:127.0.0.1:8080`), no game running.
// Screenshots can show friends' names: keep the --shots folder out of the repository.
// The tour only moves the focus and opens menus: it never presses A, and never presses Left or Right
// where that would change a value.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? null : args[i + 1];
};
const DECK = process.env.DECK;
const CDP = process.env.CDP ?? "http://127.0.0.1:9333";
const shotsDir = opt("--shots");
const jsonOut = opt("--json");
const only = opt("--only")?.split(",");
const audit = args.includes("--audit");
if (!DECK) {
  console.error("Set DECK to the ssh destination of the Deck, e.g. DECK=deck@steamdeck");
  process.exit(2);
}

// ---------- Steam's debugger ----------

// The main window's title is translated, so it is the one that is none of the others.
const OTHERS = ["QuickAccess", "MainMenu", "SharedJSContext", "notificationtoasts"];
const TARGETS = {
  main: (title) => !OTHERS.some((o) => title.includes(o)),
  quick: (title) => title.includes("QuickAccess"),
  menu: (title) => title.includes("MainMenu"),
  shared: (title) => title.includes("SharedJSContext"),
};
const sockets = new Map();

async function connect(key) {
  if (sockets.has(key)) return sockets.get(key);
  const list = await (await fetch(`${CDP}/json`)).json();
  const target = list.find((t) => t.type === "page" && TARGETS[key](t.title));
  if (!target) throw new Error(`Steam window not found: ${key}`);
  const ws = new WebSocket(target.webSocketDebuggerUrl.replace(/ws:\/\/[^/]+/, CDP.replace(/^http/, "ws")));
  const pending = new Map();
  let id = 0;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result ?? m);
      pending.delete(m.id);
    }
  };
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = fail;
  });
  const send = (method, params = {}, ms = 8000) =>
    Promise.race([
      new Promise((ok) => {
        pending.set(++id, ok);
        ws.send(JSON.stringify({ id, method, params }));
      }),
      new Promise((ok) => setTimeout(() => ok(null), ms)), // a hidden window never answers a capture
    ]);
  const conn = { send, close: () => ws.close() };
  sockets.set(key, conn);
  return conn;
}

async function evaluate(key, expression, ms = 8000) {
  const r = await (await connect(key)).send("Runtime.evaluate", { expression, returnByValue: true }, ms);
  if (!r || r.exceptionDetails) return null;
  return r.result?.value ?? null;
}

async function screenshot(key, file) {
  const r = await (await connect(key)).send("Page.captureScreenshot", { format: "png" }, 5000);
  if (r?.data) fs.writeFileSync(file, Buffer.from(r.data, "base64"));
}

const sleep = (s) => new Promise((ok) => setTimeout(ok, s * 1000));
const press = (key) => execFileSync("ssh", [DECK, `DISPLAY=:0 xdotool key ${key}`], { stdio: "ignore" });

// ---------- The theme's selectors, read from what CSS Loader injected ----------

// Top-level split on commas, ignoring the ones inside (), [] or quotes.
function splitSelectors(text) {
  const out = [];
  let depth = 0;
  let quote = null;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(from, i));
      from = i + 1;
    }
  }
  out.push(text.slice(from));
  return out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// Every selector of a stylesheet with the line it starts on. At-rules with a block of rules (@media)
// are entered; the others (@keyframes) are skipped.
function selectorsOf(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const found = [];
  let rule = -1;
  const walk = (from, to) => {
    let i = from;
    while (i < to) {
      const open = text.indexOf("{", i);
      if (open < 0 || open >= to) return;
      let depth = 1;
      let close = open + 1;
      while (close < to && depth) {
        if (text[close] === "{") depth++;
        else if (text[close] === "}") depth--;
        close++;
      }
      const head = text.slice(i, open);
      const line = text.slice(0, i + head.length - head.trimStart().length).split("\n").length;
      if (/^\s*@(media|supports|layer)/.test(head)) walk(open + 1, close - 1);
      else if (!/^\s*@/.test(head)) {
        rule++;
        for (const s of splitSelectors(head)) found.push({ line, rule, selector: s });
      }
      i = close;
    }
  };
  walk(0, text.length);
  return found;
}

// Runs in the page: which selectors match something right now. 2 = as written (states that depend on
// the pointer removed), 1 = only once focus and :has()/:not() conditions are removed too, which still
// proves the class names exist. -1 = the browser rejects the selector.
const IN_PAGE = `(() => {
  const strip = (s, re) => { let out = s, m; while ((m = re.exec(out))) {
    let i = m.index + m[0].length, d = 1; while (i < out.length && d) { if (out[i] === "(") d++; else if (out[i] === ")") d--; i++; }
    out = out.slice(0, m.index) + out.slice(i); re.lastIndex = 0; } return out; };
  const tidy = (s) => { s = s.replace(/\\s+/g, " ").trim(); if (!s) return "*"; if (/^[>+~]/.test(s)) s = "* " + s;
    if (/[>+~]$/.test(s)) s += " *"; return s.replace(/([>+~])\\s*(?=[>+~])/g, "$1 * "); };
  const asWritten = (s) => tidy(s.replace(/::?(before|after|placeholder|-webkit-[a-z-]+)/g, "")
    .replace(/:(hover|active|focus-visible|focus-within|focus)(?![\\w-])/g, ""));
  const base = (s) => tidy(strip(strip(asWritten(s), /:not\\(/g), /:has\\(/g).replace(/\\.gpfocus(within)?(?![\\w-])/g, ""));
  const hit = (s) => { try { return !!document.querySelector(s); } catch { return null; } };
  return window.__obsSelectors.map((s) => {
    const a = hit(asWritten(s));
    if (a) return 2;
    const b = hit(base(s));
    return b ? 1 : a === null && b === null ? -1 : 0;
  });
})()`;

// Runs in the page (--audit). For every rule that matches something now, switches one declaration off
// at a time and compares the computed style of the matched elements. One that changes nothing stays
// off for the rest of the run, so of two declarations that do the same job only one is spared; one
// that was off and turns out to matter in a later screen is switched back on for good.
// Returns "sheet:rule" for rules that matched and "sheet:rule:property" for declarations proven to do
// something. Custom properties, transitions, animations and `content` cannot be judged this way and
// count as proven. AUDIT_RESTORE puts the stylesheet back as it was.
const AUDIT_IN_PAGE = `(() => {
  const split = (text, sep) => { const out = []; let d = 0, q = null, from = 0;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c;
      else if (c === "(" || c === "[") d++; else if (c === ")" || c === "]") d--;
      else if (c === sep && d === 0) { out.push(text.slice(from, i)); from = i + 1; } }
    out.push(text.slice(from)); return out.map((s) => s.trim()).filter(Boolean); };
  const tidy = (s) => { s = s.replace(/\\s+/g, " ").trim(); if (!s) return "*"; if (/^[>+~]/.test(s)) s = "* " + s;
    if (/[>+~]$/.test(s)) s += " *"; return s; };
  const GROUPS = { inset: ["top", "right", "bottom", "left"], gap: ["row-gap", "column-gap"], overflow: ["overflow-x", "overflow-y"],
    flex: ["flex-grow", "flex-shrink", "flex-basis"], "border-radius": ["border-top-left-radius", "border-top-right-radius",
    "border-bottom-left-radius", "border-bottom-right-radius"] };
  const names = [...getComputedStyle(document.documentElement)];
  const watched = (prop) => [prop, ...(GROUPS[prop] ?? []), ...names.filter((n) => n.startsWith(prop + "-"))];
  const state = (window.__obsAudit ??= { orig: new Map(), off: new Map(), proven: new Set() });
  const matched = [];
  // A transition would keep the old value for a moment and hide the change. The theme sets its own
  // transitions with !important, so this needs more weight than any of its selectors.
  const still = document.head.appendChild(document.createElement("style"));
  const heavy = ":not(#a#b#c#d)";
  still.textContent = "*" + heavy + ", *" + heavy + "::before, *" + heavy + "::after { transition: none !important; }";
  const themes = [...document.styleSheets].filter((s) => s.ownerNode?.classList?.contains("css-loader-style") && /^\\/\\* Obsidiana/.test(s.ownerNode.textContent));
  const counts = [];
  themes.forEach((sheet, k) => {
    const rules = []; const flat = (list) => { for (const r of list) { if (r.style && r.selectorText) rules.push(r); else if (r.cssRules) flat(r.cssRules); } };
    flat(sheet.cssRules);
    counts.push(rules.length);
    rules.forEach((rule, ri) => {
      const targets = [];
      for (const part of split(rule.selectorText, ",")) {
        const pseudo = /::?(before|after)/.exec(part)?.[0].replace(/^:(?!:)/, "::") ?? null;
        const sel = tidy(part.replace(/::?(before|after|placeholder|-webkit-[a-z-]+)/g, "").replace(/:(hover|active|focus-visible|focus-within|focus)(?![\\w-])/g, ""));
        let els = []; try { els = [...document.querySelectorAll(sel)].slice(0, 200); } catch {}
        for (const el of els) targets.push([el, pseudo]);
      }
      if (!targets.length) return;
      matched.push(k + ":" + ri);
      if (!state.orig.has(rule)) state.orig.set(rule, rule.style.cssText);
      if (!state.off.has(rule)) state.off.set(rule, new Set());
      const decls = split(state.orig.get(rule), ";");
      const off = state.off.get(rule);
      const apply = () => { rule.style.cssText = decls.filter((_, i) => !off.has(i)).join("; "); };
      const read = (props) => targets.map(([el, ps]) => { const cs = getComputedStyle(el, ps); return props.map((p) => cs.getPropertyValue(p)).join("|"); }).join("#");
      decls.forEach((decl, di) => {
        const prop = decl.slice(0, decl.indexOf(":")).trim();
        const key = k + ":" + ri + ":" + prop;
        if (state.proven.has(key)) return;
        if (prop.startsWith("--") || /^(transition|animation|content$)/.test(prop)) { state.proven.add(key); return; }
        const props = watched(prop);
        const wasOff = off.has(di);
        const before = read(props);
        if (wasOff) off.delete(di); else off.add(di);
        apply();
        if (read(props) !== before) { off.delete(di); state.proven.add(key); } // it matters: on for good
        else off.add(di);
        apply();
      });
    });
  });
  still.remove();
  return { matched, effective: [...state.proven], counts };
})()`;
const AUDIT_RESTORE = `(() => { for (const [rule, text] of window.__obsAudit?.orig ?? []) rule.style.cssText = text; delete window.__obsAudit; return true; })()`;

const sheets = new Map(); // file name -> [{line, rule, selector, level}]
const sources = []; // the injected text of each sheet, in the order the page lists them
const ruleMatched = new Set(); // "sheet:rule"
const declEffective = new Set(); // "sheet:rule:property"
let auditAligned = true;
let renameChecked = false;
let auditFailed = 0;

async function auditStep(key) {
  const r = await evaluate(key, AUDIT_IN_PAGE, 300000); // the first screens take a while: every rule is new
  if (!r) {
    auditFailed++;
    return;
  }
  r.counts.forEach((n, k) => {
    const mine = new Set([...sheets.values()][k]?.map((s) => s.rule)).size;
    if (n !== mine) auditAligned = false; // the browser dropped a rule: rule numbers no longer line up
  });
  for (const m of r.matched) ruleMatched.add(m);
  for (const e of r.effective) declEffective.add(e);
}

// Declarations of each rule as written in the source, to name the ones without effect.
function declarationsOf(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const out = [];
  const walk = (from, to) => {
    let i = from;
    while (i < to) {
      const open = text.indexOf("{", i);
      if (open < 0 || open >= to) return;
      let depth = 1;
      let close = open + 1;
      while (close < to && depth) {
        if (text[close] === "{") depth++;
        else if (text[close] === "}") depth--;
        close++;
      }
      const head = text.slice(i, open);
      if (/^\s*@(media|supports|layer)/.test(head)) walk(open + 1, close - 1);
      else if (!/^\s*@/.test(head)) {
        const line = text.slice(0, i + head.length - head.trimStart().length).split("\n").length;
        const props = text.slice(open + 1, close - 1).split(";").map((d) => d.slice(0, d.indexOf(":")).trim()).filter(Boolean);
        out.push({ line, selector: head.replace(/\s+/g, " ").trim(), props: [...new Set(props)] });
      }
      i = close;
    }
  };
  walk(0, text.length);
  return out;
}

async function loadTheme() {
  const texts = await evaluate(
    "main",
    `[...document.querySelectorAll("style.css-loader-style")].map((s) => s.textContent).filter((t) => /^\\/\\* Obsidiana/.test(t))`,
  );
  if (!texts?.length) throw new Error("The Obsidiana theme is not loaded on the Deck");
  for (const css of texts) {
    sources.push(css);
    const name = /^\/\* Obsidiana ·\s*([^:]+):/.exec(css)?.[1]?.trim().toLowerCase() ?? "shared";
    sheets.set(name, selectorsOf(css).map((s) => ({ ...s, level: 0 })));
  }
}

const allSelectors = () => [...sheets.values()].flat();

// The real test for a rename: Steam's class names are hashes, and a selector whose hash no longer
// appears anywhere in Steam's own stylesheets can never match again.
async function findRenamed() {
  const hashes = new Set();
  const isHash = (t) => t.length >= 16 && /[a-z]/.test(t) && /[A-Z]/.test(t) && /\d/.test(t);
  for (const s of allSelectors()) {
    s.hashes = [...s.selector.matchAll(/\.([\w-]+)|\[class\*="([^"]+)"\]/g)].map((m) => m[1] ?? m[2]).filter(isHash);
    for (const h of s.hashes) hashes.add(h);
  }
  const list = [...hashes];
  const gone = await evaluate(
    "main",
    `(() => { let css = ""; for (const sheet of document.styleSheets) { if (sheet.ownerNode?.classList?.contains("css-loader-style")) continue;
      try { for (const r of sheet.cssRules) css += (r.selectorText ?? r.cssText.slice(0, 400)) + "\\n"; } catch {} }
      return css.length < 100000 ? null : ${JSON.stringify(list)}.filter((h) => !css.includes(h)); })()`,
  );
  if (!gone) return false; // Steam's styles could not be read
  for (const s of allSelectors()) s.renamed = s.hashes.filter((h) => gone.includes(h));
  return true;
}

async function observe(key) {
  const list = allSelectors();
  const ready = await evaluate(key, `window.__obsSelectors?.length === ${list.length}`);
  if (!ready) await evaluate(key, `window.__obsSelectors = ${JSON.stringify(list.map((s) => s.selector))}; true`);
  const levels = await evaluate(key, IN_PAGE);
  if (!levels) return;
  levels.forEach((level, i) => {
    if (level === -1 && list[i].level === 0) list[i].level = -1;
    else if (level > list[i].level) list[i].level = level;
  });
}

// ---------- The tour ----------

const navigate = (route) =>
  evaluate("shared", `DFL.Navigation.CloseSideMenus(); DFL.Navigation.Navigate(${JSON.stringify(route)}); true`);

// Left and Right are only pressed where they move the focus between buttons or columns. Inside a list
// of settings they would move a slider, so the tour leaves each section by navigating, never sideways.
const SETTINGS = ["system", "internet", "storage", "bluetooth", "display", "power", "audio", "controller", "keyboard",
  "customization", "accessibility", "security", "notifications", "friends", "downloads", "cloud", "ingame",
  "compatibility", "family", "remoteplay", "gamerecording", "home", "library", "store"];

// Each part: [name, window to look at, steps]. A step is a key name, "nav:<route>", "js:<code>" run in
// Steam's shared context, or "enter" (quick access: move from the tab column into the tab).
function tour({ steam, retro }) {
  const keys = (...k) => k;
  const repeat = (n, ...k) => Array.from({ length: n }, () => k).flat();
  return [
    ["home", "main", keys("nav:/library/home", "Right", "Right", "Up", "Down")],
    ["library", "main", keys("nav:/library", "Down", "Right", "F9", "Down", "Escape", "F3", "Down", "Down", "Escape", "Up", "Up", "Right")],
    ["game", "main", steam ? keys(`nav:/library/app/${steam}`, "Right", "Right", "Left", "Left", "Down", "Down") : []],
    ["achievements", "main", steam ? keys(`nav:/library/app/${steam}/achievements/my/individual`, "Down", "Down", "Down") : []],
    ["retro", "main", retro ? keys(`nav:/library/app/${retro}`, "Right", "Right", "Down") : []],
    ["settings", "main", SETTINGS.flatMap((section) => keys(`nav:/settings/${section}`, "Right", "Down", "Down"))],
    ["downloads", "main", keys("nav:/library/downloads", "Down", "Down", "Down")],
    ["media", "main", keys("nav:/media/grid", "Down", "Right", "F4", "Escape")],
    ["search", "main", keys("nav:/search", "Down", "Down", "Right")],
    ["power", "main", keys("nav:/library/home", "js:SteamUIStore.OpenPowerMenu()", "Down", "Down", "Down", "Down", "Escape")],
    ["menu", "menu", keys("nav:/library/home", "shift+Tab", "Down", "Down", "Down", "Escape")],
    // Each tab is opened directly: 0 notifications, 3 friends, 4 settings, 5 performance, 6 help, 7 music, 999 Decky.
    ["quick", "quick", [...[0, 3, 4, 5, 6, 7, 999].flatMap((tab) => keys(`js:DFL.Navigation.OpenQuickAccessMenu(${tab})`, "enter", "Down", "Down")), "Escape"]],
  ];
}

async function run() {
  press("Left"); // a real key press wakes the interface; simulated ones are swallowed while it sleeps
  await sleep(1);
  await loadTheme();
  const ids = await evaluate(
    "shared",
    `(() => { const first = (list) => list?.[0]?.appid ?? null; return {
      running: SteamUIStore.RunningApps?.length ?? 0,
      steam: first(collectionStore.localGamesCollection.allApps.filter((o) => o.app_type === 1 && !o.BIsShortcut?.())),
      retro: first(collectionStore.userCollections.find((c) => /^RomM:/.test(c.displayName))?.allApps) }; })()`,
  );
  if (!ids) throw new Error("Steam did not answer");
  if (ids.running) throw new Error("A game is running; close it first");
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
  // What an earlier run proved belongs to the stylesheet it ran against.
  for (const key of ["main", "quick", "menu"]) await evaluate(key, `${AUDIT_RESTORE}; delete window.__obsSelectors; true`);

  for (const [name, window_, steps] of tour(ids)) {
    if (only && !only.includes(name)) continue;
    let frame = 0;
    process.stderr.write(`${name} `);
    for (const step of steps) {
      if (step.startsWith("nav:")) {
        await navigate(step.slice(4));
        await sleep(3.5);
      } else if (step === "enter") {
        // From the tab column into the tab's content. Right is only safe while the focus is on a tab
        // (the narrow column on the left); anywhere else it could move a slider.
        const onTab = await evaluate(window_, `(() => { const r = document.querySelector(".gpfocus")?.getBoundingClientRect(); return !!r && r.left < 70 && r.width < 90; })()`);
        if (onTab) press("Right");
        await sleep(0.7);
      } else if (step.startsWith("js:")) {
        await evaluate("shared", `${step.slice(3)}; true`);
        await sleep(1.5);
      } else {
        press(step);
        await sleep(0.7);
      }
      await observe(window_);
      if (window_ !== "main") await observe("main");
      if (audit) await auditStep(window_);
      if (shotsDir) {
        const file = path.join(shotsDir, `${name}-${String(++frame).padStart(2, "0")}.png`);
        await screenshot(window_, file);
      }
    }
  }
  process.stderr.write("\n");
  renameChecked = await findRenamed();
  await navigate("/library/home");
}

function report() {
  let broken = 0;
  for (const [name, list] of sheets) {
    const renamed = list.filter((s) => s.renamed?.length);
    const never = list.filter((s) => s.level === 0 && !s.renamed?.length);
    const invalid = list.filter((s) => s.level === -1);
    const exact = list.filter((s) => s.level === 2).length;
    broken += renamed.length + invalid.length;
    console.log(`\n${name}: ${list.length} selectors, ${exact} matched as written, ${list.filter((s) => s.level === 1).length} only without their state, ${never.length} not seen, ${renamed.length} renamed by Steam, ${invalid.length} invalid`);
    for (const s of invalid) console.log(`  invalid  ${String(s.line).padStart(5)}  ${s.selector}`);
    for (const s of renamed) console.log(`  renamed  ${String(s.line).padStart(5)}  ${s.selector}   (gone: ${s.renamed.join(", ")})`);
    for (const s of never) console.log(`  not seen ${String(s.line).padStart(5)}  ${s.selector}`);
  }
  if (!renameChecked) console.log("\nSteam's own styles could not be read, so renamed classes were not checked.");
  if (audit) reportAudit();
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(Object.fromEntries(sheets), null, 1));
  return broken;
}

function reportAudit() {
  if (!auditAligned) {
    console.log("\nAudit: the browser dropped a rule, so declarations cannot be traced to their lines. Fix the invalid rules first.");
    return;
  }
  if (auditFailed) console.log(`\nAudit: ${auditFailed} steps gave no answer, so the list below may name declarations that do matter.`);
  const names = [...sheets.keys()];
  sources.forEach((css, k) => {
    const rules = declarationsOf(css);
    const idle = [];
    rules.forEach((rule, ri) => {
      if (!ruleMatched.has(`${k}:${ri}`)) return;
      const dead = rule.props.filter((p) => !declEffective.has(`${k}:${ri}:${p}`));
      if (dead.length) idle.push({ ...rule, dead, all: dead.length === rule.props.length });
    });
    console.log(`\n${names[k]}: ${idle.length} rules with declarations that never changed anything on this tour`);
    for (const r of idle) console.log(`  no effect ${String(r.line).padStart(5)}  ${r.all ? "(whole rule)" : r.dead.join(", ")}  <-  ${r.selector.slice(0, 110)}`);
  });
}

try {
  await run();
  const broken = report();
  console.log(broken ? `\n${broken} selectors can no longer work: fix them.` : "\nNo broken selectors. \"Not seen\" ones belong to screens or states this tour does not reach.");
  if (broken) process.exitCode = 1;
} catch (e) {
  console.error(String(e.message ?? e));
  process.exitCode = 2;
} finally {
  if (audit) for (const key of ["main", "quick", "menu"]) await evaluate(key, AUDIT_RESTORE).catch(() => {});
  for (const s of sockets.values()) s.close();
}
