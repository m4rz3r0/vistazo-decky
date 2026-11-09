import { useEffect, useState } from "react";

// User choices, kept in the Steam UI's own local storage (survives restarts, stays on the device).
export interface Settings {
  home: boolean; // our home screen instead of Steam's
  page: boolean; // panel on each Steam game page
  protondb: boolean; // ask protondb.com for the game's rating
  sounds: boolean; // calm menu sounds instead of Steam's
}

const KEY = "vistazo:settings";
const DEFAULTS: Settings = { home: true, page: true, protondb: true, sounds: true };

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw);
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as (keyof Settings)[])
      if (typeof saved?.[k] === "boolean") out[k] = saved[k];
    return out;
  } catch {
    return { ...DEFAULTS };
  }
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

export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings(): Settings {
  const [s, set] = useState(current);
  useEffect(() => onSettings(set), []);
  return s;
}
