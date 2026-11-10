import { callable } from "@decky/api";
import { useEffect, useState } from "react";
import { isUnloaded } from "./lifecycle";

// Vistazo ships the Obsidiana theme and installs it through CSS Loader, which keeps the theme's
// class names working across Steam updates. Its options live in CSS Loader (config_USER.json);
// Vistazo only reads and writes them, so both settings screens always agree.
declare const DeckyBackend: any;

export const THEME = "Obsidiana";
// Patch names and values as theme.json declares them.
export const COLOR = "Color";
export const TEXT = "Tamaño del texto";
export const MOTION = "Movimiento";
export const COLORS = ["Lima", "Fucsia", "Azul", "Sobrio"] as const;

const installTheme = callable<[], "fresh" | "updated" | "current" | "no-loader" | "foreign" | "error">(
  "install_theme",
);

// Calls a CSS Loader backend method; rejects when CSS Loader is missing or the call fails.
async function cssLoader(method: string, args: Record<string, unknown> = {}): Promise<any> {
  const reply = await DeckyBackend.call("loader/call_legacy_plugin_method", "CSS Loader", method, args);
  if (!reply?.success) throw new Error(String(reply?.result ?? "CSS Loader call failed"));
  return reply.result;
}

export interface ThemeState {
  enabled: boolean;
  color: string;
  largeText: boolean;
  motion: boolean;
}

type Status = { loader: false } | { loader: true; theme: ThemeState | null };

let status: Status | null = null;
const listeners = new Set<(s: Status) => void>();
function publish(next: Status) {
  status = next;
  listeners.forEach((fn) => fn(next));
}

async function refresh(): Promise<void> {
  let themes: any[];
  try {
    themes = await cssLoader("get_themes");
  } catch (e) {
    // Only a missing CSS Loader means "needs CSS Loader"; any other failure keeps what we knew.
    if (/KeyError/.test(String(e)) || !status) publish({ loader: false });
    console.warn("Vistazo: CSS Loader themes unreadable", e);
    return;
  }
  try {
    const t = themes.find((x) => x.name === THEME);
    const patch = (name: string) => t?.patches?.find((p: any) => p.name === name)?.value;
    publish({
      loader: true,
      theme: t
        ? {
            enabled: !!t.enabled,
            color: patch(COLOR) ?? "Lima",
            largeText: patch(TEXT) === "Grande",
            motion: patch(MOTION) !== "No",
          }
        : null,
    });
  } catch (e) {
    console.warn("Vistazo: unexpected CSS Loader reply", e);
  }
}

// At startup: copy the bundled theme when it is new or newer, make CSS Loader read it again and,
// the first time only, turn it on. CSS Loader may start after Vistazo, so wait for it a little.
export async function setupTheme(): Promise<void> {
  let result: Awaited<ReturnType<typeof installTheme>> = "error";
  try {
    result = await installTheme();
  } catch {
    /* backend unavailable: still report what CSS Loader has */
  }
  // The first turn-on is remembered until CSS Loader confirms it, so a slow start never loses it.
  if (result === "fresh") store(ENABLE_PENDING, "1");
  const enable = store(ENABLE_PENDING) === "1";
  // Each step once: a retry after CSS Loader answered the first must not make it reload again.
  let reload = result === "fresh" || result === "updated";
  if (reload || enable) {
    for (let tries = 0; tries < 10 && !isUnloaded(); tries++) {
      try {
        if (reload) await cssLoader("reset");
        reload = false;
        if (enable) await cssLoader("set_theme_state", { name: THEME, state: true });
        store(ENABLE_PENDING, null);
        break;
      } catch (e) {
        if (tries === 9) console.warn("Vistazo: CSS Loader didn't answer; trying again next start", e);
        else await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  if (!isUnloaded()) await refresh();
}

const ENABLE_PENDING = "vistazo:theme-enable-pending";
function store(key: string, value?: string | null): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
  return null;
}

export async function setThemeEnabled(on: boolean): Promise<void> {
  await cssLoader("set_theme_state", { name: THEME, state: on }).catch(() => undefined);
  await refresh();
}

export async function setThemeOption(patchName: string, value: string): Promise<void> {
  await cssLoader("set_patch_of_theme", { themeName: THEME, patchName, value }).catch(() => undefined);
  await refresh();
}

export function useTheme(): Status | null {
  const [s, set] = useState(status);
  useEffect(() => {
    listeners.add(set);
    // The theme may have been changed from CSS Loader's own screen: read it again on open.
    refresh();
    return () => {
      listeners.delete(set);
    };
  }, []);
  return s;
}
