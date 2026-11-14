import { safe } from "./safe";
import { useEffect, useState } from "react";

// User choices, kept in the Steam UI's own local storage (survives restarts, stays on the device).
export interface Settings {
  home: boolean; // our home screen instead of Steam's
  page: boolean; // panel on each Steam game page
  protondb: boolean; // ask protondb.com for the game's rating
  sounds: boolean; // calm menu sounds instead of Steam's
  aOpensPage: boolean; // home: A opens the game page and X plays (Steam games only)
  retro: boolean; // the same first screen on RomM game pages (Tender's own page when off)
  updates: boolean; // ask GitHub once a day for a newer Vistazo and say so
  shelves: string[]; // home shelves on show, by id (see availableShelves)
  avatar: Avatar; // the shape of the player's picture in the top bar
}
export const AVATARS = ["round", "rounded", "steam"] as const;
export type Avatar = (typeof AVATARS)[number];

const KEY = "vistazo:settings";
const DEFAULTS: Settings = { home: true, page: true, protondb: true, sounds: true, aOpensPage: false, retro: true, updates: true, shelves: ["installed", "retro"], avatar: "round" };

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
