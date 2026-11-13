import { callable } from "@decky/api";
import { useEffect, useState } from "react";

// Vistazo's own RomM key, used only to have RomM read a player's achievements again after a game.
// The key lives in the backend; the frontend only ever sees what state it is in.

export type RommStatus = "linked" | "unlinked" | "moved" | "no-server";
export type PairResult = "ok" | "code" | "invalid" | "scopes" | "no-server" | "unreachable" | "error";
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

const status = callable<[], RommStatus>("romm_status");
const pair = callable<[code: string], PairResult>("romm_pair");
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

export async function pairRomm(code: string): Promise<PairResult> {
  let result: PairResult = "error";
  try {
    result = await pair(code);
  } catch (e) {
    console.warn("[Vistazo] RomM pair", e);
  }
  await rommStatus();
  return result;
}

export async function unlinkRomm(): Promise<void> {
  try {
    publish(await unlink());
  } catch (e) {
    console.warn("[Vistazo] RomM unlink", e);
  }
}

export const isLinked = () => current === "linked";

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
