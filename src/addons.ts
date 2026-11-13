import { useEffect, useState } from "react";
import type { ComponentType } from "react";

// Vistazo is the look; what it knows about games that are not Steam's comes from add-ons: other
// Decky plugins, installed only by those who want them (RomM games, GeForce NOW…). An add-on
// brings no screens of its own into Vistazo's pages: it hands over facts and things to do, and
// Vistazo draws them like everything else. This file is the whole contract between the two.
//
// An add-on waits for `window.Vistazo` (Vistazo may load after it, and loads again on every
// update: it announces itself with a "vistazo:ready" event on the window), checks
// `Vistazo.contract >= its own`, and calls `Vistazo.register(addon)`. The call returns the
// function that takes it out again, for when the add-on unloads.
export const CONTRACT = 1;

export interface AddonAchievement {
  id: string;
  title: string;
  description: string;
  points: number;
  players: number; // how many players have it
  badge: string; // picture when earned (https)
  badgeLocked: string; // picture while pending (https)
  order: number; // the game's own order
}

// What an add-on knows of one game, for its page. Everything is optional: what is missing is
// simply not shown. Texts come already in the player's language.
export interface AddonGame {
  platform?: string;
  year?: number;
  genres?: string[];
  rating?: number; // 0-100
  size?: number; // bytes
  summary?: string;
  achievements?: { earned: number; total: number; hardcore: number; got: string[]; list: AddonAchievement[] };
  stale?: boolean; // the source did not answer: this is from the last time it did
}

// The game's file, when the add-on is what brings it: whether it is on the Deck, and how a
// download goes (`share` 0-100; `problem` in the player's language when one failed).
export interface AddonFile {
  here: boolean;
  downloading: boolean;
  share: number;
  problem?: string;
}

// A shelf an add-on brings to the home: Steam entries it made, under its own name.
export interface AddonShelf {
  id: string;
  label: string;
  apps: number[];
}

// Something to do with a game, shown as a quiet button on its page.
export interface AddonAction {
  id: string;
  label: string;
  run(): void | Promise<void>;
}

// A player's achievements in one game, by its RetroAchievements number.
export interface AddonProgress {
  ok: boolean;
  why?: string;
  changed?: boolean;
  earned?: number;
  hardcore?: number;
  total?: number;
  ids?: string[];
  hardcore_ids?: string[];
}

export interface Addon {
  id: string; // short and fixed: "romm", "geforcenow"
  name: string;
  contract: number; // the contract it was written for
  // Whether this non-Steam entry is the add-on's (its page is then Vistazo's, with `game`).
  owns?(appid: number): boolean;
  // The game behind one of its entries; `refresh` when it was just played.
  game?(appid: number, refresh: boolean): Promise<AddonGame | null>;
  // The game's file (asked often while a download runs: keep it light). None: nothing to bring.
  file?(appid: number): Promise<AddonFile | null>;
  // Bringing the game's file, and stopping that.
  fetchFile?(appid: number): Promise<void>;
  cancelFile?(appid: number): Promise<void>;
  // Its entries for the home's Retro shelf (marked with the eye).
  shelf?(): number[];
  // Shelves of its own on the home (cloud games, say): the player turns each on in the settings.
  shelves?(): AddonShelf[];
  // Things to do on a Steam game's page ("play on …"). None: an empty list.
  actions?(appid: number): Promise<AddonAction[]>;
  // Achievements straight from the add-on's source, for pages another program draws.
  progress?(raId: number, refresh: boolean): Promise<AddonProgress | null>;
  // Its own section in Vistazo's settings (plain Decky rows).
  Settings?: ComponentType;
}

export interface VistazoApi {
  contract: number;
  register(addon: Addon): () => void;
  changed(): void; // an add-on's games changed: whatever shows them reads again
}

const addons = new Map<string, Addon>();
const watchers = new Set<() => void>();
const changed = () => watchers.forEach((fn) => fn());

export const allAddons = (): Addon[] => [...addons.values()];
// The add-on a non-Steam entry belongs to, if any.
export const ownerOf = (appid: number): Addon | null =>
  allAddons().find((a) => {
    try {
      return !!a.owns?.(appid);
    } catch {
      return false;
    }
  }) ?? null;
// The first add-on that offers something, for the pages that only need one.
export const firstWith = <K extends keyof Addon>(key: K): Addon | null => allAddons().find((a) => !!a[key]) ?? null;

// Re-renders whoever uses it when add-ons come, go or say their games changed.
export function useAddons(): number {
  const [round, set] = useState(0);
  useEffect(() => {
    const fn = () => set((n) => n + 1);
    watchers.add(fn);
    return () => {
      watchers.delete(fn);
    };
  }, []);
  return round;
}
export function onAddonChange(fn: () => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

// Puts the contract on the window; returns what takes it away when Vistazo unloads.
export function openAddons(): () => void {
  const api: VistazoApi = {
    contract: CONTRACT,
    register(addon) {
      // Only something that says who it is and was written for a contract Vistazo has.
      if (!addon || typeof addon.id !== "string" || !/^[a-z0-9-]{2,32}$/.test(addon.id)) return () => undefined;
      if (typeof addon.contract !== "number" || addon.contract > CONTRACT) {
        console.warn(`[Vistazo] add-on ${addon.id} needs a newer Vistazo`);
        return () => undefined;
      }
      addons.set(addon.id, addon);
      changed();
      return () => {
        if (addons.get(addon.id) === addon) {
          addons.delete(addon.id);
          changed();
        }
      };
    },
    changed,
  };
  (window as any).Vistazo = api;
  window.dispatchEvent(new Event("vistazo:ready"));
  return () => {
    if ((window as any).Vistazo === api) delete (window as any).Vistazo;
    addons.clear();
    changed();
  };
}
