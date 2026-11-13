import { callable } from "@decky/api";
import { useEffect, useState } from "react";

// Vistazo's own RomM key: to have RomM read a player's achievements again after a game and, for
// those who let Vistazo look after their RomM games, to see the games and bring their files.
// The key lives in the backend; the frontend only ever sees what state it is in.

// "limited": a key for achievements only. "linked": one that may also look after the games.
export type RommStatus = "linked" | "limited" | "unlinked" | "moved" | "no-server";
export type PairResult = "ok" | "limited" | "code" | "invalid" | "scopes" | "no-server" | "unreachable" | "busy" | "error";
// What came of a pairing code, with the permissions the key lacks or has too many of.
export interface PairAnswer {
  result: PairResult;
  missing: string[];
  extra: string[];
}
// Whether RomM still takes the stored key, asked on the spot.
export type RommHealth = "ok" | "refused" | "unreachable";
export interface Progress {
  ok: boolean;
  why?: string;
  changed?: boolean; // RomM read RetroAchievements again and these figures came from that
  earned?: number;
  hardcore?: number;
  total?: number;
  ids?: string[];
  hardcore_ids?: string[];
}

// One game as RomM has it, for its page.
export interface RommGame {
  ok: boolean;
  why?: string;
  rom_id: number;
  name: string;
  platform: string;
  system: string;
  released: number; // milliseconds
  genres: string[];
  rating: number;
  summary: string;
  ra_id: number;
  size: number;
  achievements: { badge_id: string; title: string; description: string; points: number; num_awarded: number; badge_url: string; badge_url_lock: string; order: number }[];
}
export const rommGame = callable<[romId: number], RommGame>("romm_game");

const status = callable<[], RommStatus>("romm_status");
const pair = callable<[code: string, games: boolean], PairAnswer>("romm_pair");
const check = callable<[], string>("romm_check");
const unlink = callable<[], RommStatus>("romm_unlink");
export const rommProgress = callable<[raId: number, refresh: boolean], Progress>("romm_progress");

let current: RommStatus | null = null;
const listeners = new Set<(s: RommStatus | null) => void>();
const publish = (s: RommStatus | null) => {
  current = s;
  listeners.forEach((fn) => fn(s));
};

export async function rommStatus(): Promise<RommStatus | null> {
  try {
    publish(await status());
  } catch (e) {
    console.warn("[Vistazo] RomM status", e);
  }
  return current;
}

export async function pairRomm(code: string, games: boolean): Promise<PairAnswer> {
  let answer: PairAnswer = { result: "error", missing: [], extra: [] };
  try {
    const got = await pair(code, games);
    if (got && typeof got.result === "string") answer = { result: got.result, missing: got.missing ?? [], extra: got.extra ?? [] };
  } catch (e) {
    console.warn("[Vistazo] RomM pair", e);
  }
  await rommStatus();
  return answer;
}

export async function checkRomm(): Promise<RommHealth | null> {
  let health: RommHealth | null = null;
  try {
    const got = await check();
    if (got === "ok" || got === "refused" || got === "unreachable") health = got;
  } catch (e) {
    console.warn("[Vistazo] RomM check", e);
  }
  if (health === "refused") await rommStatus();
  return health;
}

// A permission as RomM's own screen shows it: "assets.write" -> "Assets (write)".
export const scopeNames = (scopes: string[]) =>
  scopes
    .map((s) => {
      const [group, what] = s.split(".");
      return `${group.charAt(0).toUpperCase()}${group.slice(1)}${what ? ` (${what})` : ""}`;
    })
    .join(", ");

export async function unlinkRomm(): Promise<void> {
  try {
    publish(await unlink());
  } catch (e) {
    console.warn("[Vistazo] RomM unlink", e);
  }
}

// Either key reads achievements; only the wider one sees the games.
export const isLinked = () => current === "linked" || current === "limited";
export const seesGames = () => current === "linked";

export function useRomm(): RommStatus | null {
  const [s, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    rommStatus();
    return () => {
      listeners.delete(set);
    };
  }, []);
  return s;
}
