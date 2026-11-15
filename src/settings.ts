import { safe } from "./safe";
import { useEffect, useState } from "react";

// User choices, kept in the Steam UI's own local storage (survives restarts, stays on the device).
// The home screen, the game pages (Steam's and RomM's), the calm menu sounds and the daily look for
// a newer version are always on: they used to have switches, and older saved choices are ignored.
export interface Settings {
  protondb: boolean; // ask protondb.com for the game's rating
  aOpensPage: boolean; // home: A opens the game page and X plays (Steam games only)
  shelves: string[]; // home shelves on show, by id (see availableShelves)
  avatar: Avatar; // the shape of the player's picture in the top bar
}
export const AVATARS = ["round", "rounded", "steam"] as const;
export type Avatar = (typeof AVATARS)[number];

const KEY = "vistazo:settings";
const DEFAULTS: Settings = { protondb: true, aOpensPage: false, shelves: ["installed", "retro"], avatar: "round" };

function read(): Settings {
  const saved = safe(() => JSON.parse(localStorage.getItem(KEY) ?? "null"), {});
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const v = saved[k];
    if (typeof v === typeof DEFAULTS[k] && !Array.isArray(DEFAULTS[k])) (out as any)[k] = v;
    else if (Array.isArray(DEFAULTS[k]) && Array.isArray(v)) (out as any)[k] = v.filter((x: unknown) => typeof x === "string");
  }
  if (!AVATARS.includes(out.avatar)) out.avatar = DEFAULTS.avatar;
  return out;
}

let current = read();
const listeners = new Set<(s: Settings) => void>();

export const settings = () => current;

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: the choice lasts until Steam restarts */
  }
  for (const fn of listeners) fn(current);
}

// For what is not a component: called with the settings every time one changes.
export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSettings(): Settings {
  const [s, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    return () => {
      listeners.delete(set);
    };
  }, []);
  return s;
}
