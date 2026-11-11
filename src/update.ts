import { toaster } from "@decky/api";
import { useEffect, useState } from "react";
import { t } from "./i18n";
import { isUnloaded } from "./lifecycle";
import { safe } from "./safe";
import { settings } from "./settings";

// Updates without typing the address again. Vistazo asks GitHub for its latest release and hands
// the zip to Decky's own installer, which shows its usual confirmation, checks the zip against the
// SHA-256 GitHub publishes for it and reloads the plugin. Nothing is installed here, and nothing
// without the user saying yes in Decky's dialog.
declare const DeckyBackend: any;
declare const DeckyPluginLoader: any;

const NAME = "Vistazo";
const LATEST = "https://api.github.com/repos/m4rz3r0/vistazo-decky/releases/latest";
// Only a zip from this project's own releases is ever handed to the installer.
const DOWNLOADS = "https://github.com/m4rz3r0/vistazo-decky/releases/download/";
const UPDATE = 2; // Decky's PluginInstallType.UPDATE
const DAY = 24 * 60 * 60 * 1000;
const KEY = "vistazo:update";

export interface Release {
  version: string; // "0.14.0"
  url: string;
  hash: string; // SHA-256 of the zip, in hex
}

export interface UpdateState {
  current: string; // installed version, "" when Decky doesn't say
  latest: Release | null; // newest release known, whether or not it is newer than the installed one
  available: boolean;
  checking: boolean;
  failed: boolean; // the last check could not reach GitHub
}

interface Saved {
  at: number; // when GitHub was last asked
  latest: Release | null;
  told: string; // version already announced with a notification
}

const installed = () =>
  safe(() => String(DeckyPluginLoader.plugins.find((p: any) => p.name === NAME).version ?? ""), "");

const parts = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
export function isNewer(candidate: string, than: string): boolean {
  const a = parts(candidate);
  const b = parts(than);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

// Reads a release as GitHub describes it; null unless it has this project's zip with its checksum.
export function readRelease(data: any): Release | null {
  const version = /^v(\d+(\.\d+)*)$/.exec(String(data?.tag_name ?? ""))?.[1];
  const asset = (Array.isArray(data?.assets) ? data.assets : []).find((a: any) => a?.name === "Vistazo.zip");
  const url = String(asset?.browser_download_url ?? "");
  const hash = /^sha256:([0-9a-f]{64})$/.exec(String(asset?.digest ?? ""))?.[1];
  if (!version || !hash || url !== `${DOWNLOADS}v${version}/Vistazo.zip`) return null;
  return { version, url, hash };
}

function load(): Saved {
  const s = safe(() => JSON.parse(localStorage.getItem(KEY) ?? "null"), {} as any);
  return {
    at: typeof s.at === "number" ? s.at : 0,
    latest: s.latest ? readSaved(s.latest) : null,
    told: typeof s.told === "string" ? s.told : "",
  };
}
// What was saved goes through the same checks as what GitHub sends.
const readSaved = (r: any): Release | null =>
  readRelease({
    tag_name: `v${r?.version}`,
    assets: [{ name: "Vistazo.zip", browser_download_url: r?.url, digest: `sha256:${r?.hash}` }],
  });

let saved = load();
let checking = false;
let failed = false;
const listeners = new Set<(s: UpdateState) => void>();

function save(next: Partial<Saved>) {
  saved = { ...saved, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage unavailable: it is asked again after a restart */
  }
}

function state(): UpdateState {
  const current = installed();
  const available = !!saved.latest && !!current && isNewer(saved.latest.version, current);
  return { current, latest: saved.latest, available, checking, failed };
}
const publish = () => {
  const s = state();
  for (const fn of listeners) fn(s);
};

// Asks GitHub. Without `force` it keeps to once a day.
export async function checkForUpdate(force = false): Promise<void> {
  // Math.abs: a clock that was ahead when this was saved must not stop the checks.
  if (checking || (!force && Math.abs(Date.now() - saved.at) < DAY)) return;
  checking = true;
  failed = false;
  publish();
  try {
    const reply = await fetch(LATEST, { headers: { Accept: "application/vnd.github+json" } });
    if (!reply.ok) throw new Error(String(reply.status));
    save({ at: Date.now(), latest: readRelease(await reply.json()) });
  } catch (e) {
    failed = true;
    console.warn("[Vistazo] update check", e);
  }
  checking = false;
  publish();
}

let asked = 0;
// Opens Decky's own "update plugin" dialog for the newest release.
export function installUpdate() {
  const s = state();
  // A second press while Decky's dialog is coming up would open another one.
  if (!s.available || !s.latest || Date.now() - asked < 5000) return;
  asked = Date.now();
  Promise.resolve(
    DeckyBackend.call("utilities/install_plugin", s.latest.url, NAME, s.latest.version, s.latest.hash, UPDATE),
  ).catch((e) => console.warn("[Vistazo] update", e));
}

// Once a day, a while after Steam starts, and one notification per new version. Only while
// "tell me about new versions" is on; the settings screen can always ask by hand.
export function watchUpdates() {
  const run = async () => {
    if (isUnloaded() || !settings().updates) return;
    await checkForUpdate();
    const s = state();
    if (isUnloaded() || !settings().updates || !s.available || !s.latest || saved.told === s.latest.version) return;
    save({ told: s.latest.version });
    toaster.toast({ title: t.updateToastTitle(s.latest.version), body: t.updateToastBody, onClick: installUpdate });
  };
  const first = setTimeout(run, 45 * 1000);
  const daily = setInterval(run, DAY / 4);
  return () => {
    clearTimeout(first);
    clearInterval(daily);
  };
}

export function useUpdate(): UpdateState {
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    set(state());
    return () => {
      listeners.delete(set);
    };
  }, []);
  return s;
}
