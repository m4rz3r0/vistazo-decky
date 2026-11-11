import { safe } from "./safe";
import { definePlugin, routerHook } from "@decky/api";
import {
  afterPatch,
  createReactTreePatcher,
  findInReactTree,
} from "@decky/ui";
import { createElement } from "react";
import { Panel } from "./Panel";
import { Home } from "./home/Home";
import { SettingsPanel } from "./SettingsPanel";
import { setupTheme } from "./theme";
import { watchGames } from "./data";
import { watchRetroPages } from "./retro";
import { watchUpdates } from "./update";
import { settings, useSettings } from "./settings";
import { installSounds } from "./sounds";
import { Guard } from "./Guard";
import { markUnloaded } from "./lifecycle";

const ROUTE = "/library/app/:appid";
const HOME = "/library/home";

// Steam store games only: shortcuts (Tender/RomM and other non-Steam apps) keep their own page untouched.
function isSteamGame(overview: any): boolean {
  return overview?.app_type === 1 && safe(() => !overview.BIsModOrShortcut?.(), false);
}

// Each loaded copy of the plugin marks its own wrappers. After unload (uninstall, update) the old
// wrappers may still sit on mounted elements, so they turn into pass-throughs.
const MARK = Symbol("vistazo");
let active = true;
const isOurs = (x: any) => !!x && x[MARK] === true;
const ours = <T,>(x: T): T => {
  (x as any)[MARK] = true;
  return x;
};

type After = (props: any, out: any) => any;
const wrapCache = new Map<string, WeakMap<object, any>>();

// Steam renders the app page through nested function / memo components. To change their output we
// swap the element's type for a wrapper that calls the original and post-processes the result.
// Wrappers are cached per original type so React keeps the same identity and never remounts.
function wrapType(el: any, tag: string, after: After) {
  const orig = el?.type;
  if (!orig || isOurs(orig)) return;
  let cache = wrapCache.get(tag);
  if (!cache) wrapCache.set(tag, (cache = new WeakMap()));
  let w = cache.get(orig);
  if (!w) {
    const run = (props: any, out: any) => {
      if (!active) return out;
      try {
        return after(props, out);
      } catch (e) {
        console.error(`[Vistazo] ${tag}`, e);
        return out;
      }
    };
    const wrapFn = (fn: Function) =>
      ours(function (this: any, props: any, ref: any) {
        return run(props, fn.call(this, props, ref));
      });
    if (typeof orig === "function" && orig.prototype?.isReactComponent) {
      const Base = orig as any;
      // Steam's class components are MobX observers: on first render MobX installs its reactive render
      // as an own property via Object.defineProperty, after which the prototype render is bypassed.
      // Other plugins may wrap the same class the same way, so we chain instead of replacing:
      // intercept that defineProperty for this instance and wrap whatever render ends up installed.
      const wrapOwn = (self: any, fn: Function) =>
        ours(function (...r: any[]) {
          return run(self.props, fn.apply(self, r));
        });
      const needsWrap = (d: PropertyDescriptor | undefined) =>
        !!d && typeof d.value === "function" && !isOurs(d.value);
      const adoptOwnRender = (self: any) => {
        const d = Object.getOwnPropertyDescriptor(self, "render");
        if (needsWrap(d)) {
          Object.defineProperty(self, "render", {
            ...d,
            value: wrapOwn(self, d!.value),
          });
        }
      };
      w = class extends Base {
        constructor(...args: any[]) {
          super(...args);
          adoptOwnRender(this);
        }
        render(...rargs: any[]) {
          const self = this as any;
          const define = Object.defineProperty;
          Object.defineProperty = function (
            o: any,
            k: PropertyKey,
            d: PropertyDescriptor,
          ) {
            if (o === self && k === "render" && needsWrap(d))
              d = { ...d, value: wrapOwn(self, d.value) };
            return define.call(Object, o, k, d);
          } as typeof Object.defineProperty;
          let out;
          try {
            out = super.render(...rargs);
          } finally {
            Object.defineProperty = define;
          }
          adoptOwnRender(self);
          return run(self.props, out);
        }
      };
      ours(w);
    } else if (typeof orig === "function") {
      w = wrapFn(orig);
    } else if (typeof orig === "object" && typeof orig.type === "function") {
      w = { ...orig, type: wrapFn(orig.type), [MARK]: true }; // React.memo
    } else if (typeof orig === "object" && typeof orig.render === "function") {
      w = { ...orig, render: wrapFn(orig.render), [MARK]: true }; // forwardRef
    } else {
      return;
    }
    cache.set(orig, w);
  }
  el.type = w;
}

// One console line per broken hook, not one per render, so a Steam update that moves things is visible.
const reported = new Set<string>();
function missed(what: string) {
  if (reported.has(what)) return;
  reported.add(what);
  console.warn(`[Vistazo] ${what}: Steam's page changed shape; leaving it as is`);
}

function findAll(node: any, pred: (x: any) => boolean, acc: any[] = []): any[] {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const n of node) findAll(n, pred, acc);
    return acc;
  }
  if (pred(node)) {
    acc.push(node);
    return acc;
  }
  return findAll(node.props?.children, pred, acc);
}

// Body under the hero renders a list: [play bar, cloud status, …, tabs]. The tabs entry is a focus
// wrapper around the tab-strip host. Put the panel right before it.
const isTabsHost = (x: any) =>
  x?.props?.fnOnCancelFromTabHeader !== undefined && x?.props?.setSections;
const isBody = (x: any) =>
  x?.props?.onGameInfoToggle !== undefined &&
  x?.props?.setSections &&
  x?.props?.overview;

function afterBody(props: any, out: any) {
  const overview = props?.overview;
  if (!isSteamGame(overview)) return out;
  const list = findInReactTree(
    out,
    (x: any) =>
      Array.isArray(x?.props?.children) &&
      x.props.children.some((c: any) => c && findInReactTree(c, isTabsHost)),
  );
  if (!list) {
    // Steam nests the body one component deeper (same props); follow it.
    for (const inner of findAll(out, isBody))
      wrapType(inner, "body-inner", afterBody);
    return out;
  }
  const children: any[] = list.props.children;
  const idx = children.findIndex(
    (c: any) => c && findInReactTree(c, isTabsHost),
  );
  // Steam's tabs (activity, "Your stuff"…) give way to the panel: the page is one screen with what
  // matters on it and nothing below to scroll to. Kept inside a switch, so turning the panel off
  // in the settings brings them back at once.
  if (children[idx]?.key !== "vistazo-tabs")
    children[idx] = createElement(TabsSwitch, { key: "vistazo-tabs" }, children[idx]);
  // The sticky copy (shown while scrolling) never gets the panel.
  if (
    !props?.bStickyHeader &&
    !children.some((c: any) => c?.key === "vistazo-panel")
  ) {
    children.splice(
      idx,
      0,
      createElement(PagePanel, { key: "vistazo-panel", appid: overview.appid }),
    );
  }
  return out;
}

function afterDetails(props: any, out: any) {
  if (!isSteamGame(props?.overview)) return out;
  for (const body of findAll(out, isBody)) wrapType(body, "body", afterBody);
  return out;
}

function patchAppPage() {
  return routerHook.addPatch(ROUTE, (tree: any) => {
    const routeProps = findInReactTree(tree, (x: any) => x?.renderFunc);
    if (!routeProps) {
      missed("route");
      return tree;
    }
    const handler = createReactTreePatcher(
      [
        (t: any) =>
          findInReactTree(t, (x: any) => x?.props?.children?.props?.overview)
            ?.props?.children,
      ],
      (_: any, ret: any) => {
        try {
          const details = findInReactTree(
            ret,
            (x: any) =>
              x?.props?.onGameInfoButtonToggle !== undefined &&
              x?.props?.overview,
          );
          if (details) wrapType(details, "details", afterDetails);
          else missed("details");
        } catch (e) {
          console.error("[Vistazo] patch", e);
        }
        return ret;
      },
      "Vistazo",
    );
    afterPatch(routeProps, "renderFunc", handler);
    return tree;
  });
}

// Home: our "Escenario" replaces Steam's home (recent games, What's New, Friends and Recommended tabs).
// Steam's home is a memo component whose output is a page frame (header, footer padding) around the
// recent-games shelf and the tabs. We keep the frame, so Steam's top bar stays, and put ours inside.
const isHomeFrame = (x: any) =>
  x?.props?.headerVisibility !== undefined && x?.props?.children;

// Both switches keep Steam's own content at hand, so turning a setting off shows Steam's screen at once.
// If our screen fails to draw (a Steam update moved something it reads), Steam's own shows instead.
function HomeSwitch({ steam }: { steam: any }) {
  return useSettings().home
    ? createElement(Guard, { name: "home", fallback: steam }, createElement(Home))
    : steam;
}
function TabsSwitch({ children }: { children?: any }) {
  return useSettings().page ? null : children;
}
// Keyed by appid: a new game starts with fresh state.
function PagePanel({ appid }: { appid: number }) {
  return useSettings().page
    ? createElement(Guard, { name: "page", key: appid }, createElement(Panel, { appid }))
    : null;
}

function afterHome(_: any, out: any) {
  const frame = findInReactTree(out, isHomeFrame);
  if (!frame) missed("home");
  else
    frame.props = {
      ...frame.props,
      children: createElement(HomeSwitch, { steam: frame.props.children }),
    };
  return out;
}

function patchHome() {
  return routerHook.addPatch(HOME, (props: any) => {
    try {
      const el = props.children?.type?.({}); // Decky's wrapper returns the original home element
      if (el?.type) {
        wrapType(el, "home", afterHome);
        props.children = el;
      }
    } catch (e) {
      console.error("[Vistazo] home", e);
    }
    return props;
  });
}

// An open eye: "vistazo" means a glance. Drawn with the current colour so Decky's list styles it.
function GlanceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path
        d="M2 12c2.6-4.4 6-6.6 10-6.6s7.4 2.2 10 6.6c-2.6 4.4-6 6.6-10 6.6S4.6 16.4 2 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  );
}

export default definePlugin(() => {
  const patch = patchAppPage();
  const homePatch = patchHome();
  const removeSounds = installSounds(() => settings().sounds);
  setupTheme();
  const stopWatching = watchGames();
  const stopUpdates = watchUpdates();
  const stopRetro = watchRetroPages();
  return {
    name: "Vistazo",
    titleView: <div>Vistazo</div>,
    content: <SettingsPanel />,
    icon: <GlanceIcon />,
    onDismount() {
      active = false;
      markUnloaded();
      removeSounds();
      stopWatching();
      stopUpdates();
      stopRetro();
      routerHook.removePatch(ROUTE, patch);
      routerHook.removePatch(HOME, homePatch);
    },
  };
});
