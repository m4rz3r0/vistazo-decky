import { useEffect, useState } from "react";
import { CONTRACT } from "./addons";
import { lang } from "./i18n";
import { safe } from "./safe";
import { isNewer } from "./update";

// The add-ons Vistazo can offer, without anyone typing an address. The list is a small file in
// Vistazo's own repository on GitHub; each add-on is a Decky plugin in a repository of the same
// account. Vistazo installs nothing itself: it reads the add-on's latest release and hands its
// zip to Decky's own installer, with the SHA-256 GitHub publishes for it, and Decky asks the
// player. Only that account's repositories and only the zip the list names are ever accepted.
declare const DeckyBackend: any;
declare const DeckyPluginLoader: any;

const OWNER = "m4rz3r0";
const LIST = `https://raw.githubusercontent.com/${OWNER}/vistazo-decky/main/addons.json`;
const INSTALL = 0; // Decky's PluginInstallType.INSTALL
const UPDATE = 2;
const DAY = 24 * 60 * 60 * 1000;
const KEY = "vistazo:addons";

export interface Offer {
  id: string;
  plugin: string; // its name in Decky
  repo: string;
  zip: string;
  name: string;
  about: string;
  contract: number; // the contract it needs
}
export interface OfferState extends Offer {
  installed: string; // version on the Deck, "" when it is not
  tooNew: boolean; // it needs a newer Vistazo
}

const text = (v: any): string => {
  const s = v && typeof v === "object" ? v[lang] ?? v.en : v;
  return typeof s === "string" ? s.slice(0, 200) : "";
};
// One entry of the list, only when every part of it is what it should be.
function readOffer(e: any): Offer | null {
  const [id, plugin, repo, zip] = [e?.id, e?.plugin, e?.repo, e?.zip].map((v) => (typeof v === "string" ? v : ""));
  if (!/^[a-z0-9-]{2,32}$/.test(id) || !/^[A-Za-z0-9 ]{2,40}$/.test(plugin)) return null;
  if (!/^[a-z0-9-]{2,60}$/.test(repo) || !/^[A-Za-z0-9]{2,40}\.zip$/.test(zip)) return null;
  const name = text(e.name);
  if (!name) return null;
  return { id, plugin, repo, zip, name, about: text(e.about), contract: Number(e.contract) || 1 };
}
const readList = (data: any): Offer[] =>
  (Array.isArray(data?.addons) ? data.addons : []).map(readOffer).filter((o: Offer | null): o is Offer => !!o).slice(0, 20);

let offers: Offer[] = readList(safe(() => JSON.parse(localStorage.getItem(KEY) ?? "null")?.list, null));
let at = safe(() => Number(JSON.parse(localStorage.getItem(KEY) ?? "null")?.at) || 0, 0);
let failed = false;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((fn) => fn());

const installedVersion = (plugin: string) =>
  safe(() => String(DeckyPluginLoader.plugins.find((p: any) => p.name === plugin)?.version ?? ""), "");

export async function readAddonList(force = false): Promise<void> {
  if (!force && Math.abs(Date.now() - at) < DAY) return;
  try {
    const reply = await fetch(LIST, { cache: "no-store" });
    if (!reply.ok) throw new Error(String(reply.status));
    const data = await reply.json();
    offers = readList(data);
    at = Date.now();
    failed = false;
    safe(() => localStorage.setItem(KEY, JSON.stringify({ at, list: data })), undefined);
  } catch (e) {
    failed = true;
    console.warn("[Vistazo] add-ons list", e);
  }
  publish();
}

// The add-on's latest release: only its own zip, at its own repository's address, with its sum.
async function latest(o: Offer): Promise<{ version: string; url: string; hash: string } | null> {
  const reply = await fetch(`https://api.github.com/repos/${OWNER}/${o.repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!reply.ok) return null;
  const data = await reply.json();
  const version = /^v(\d+(\.\d+)*)$/.exec(String(data?.tag_name ?? ""))?.[1];
  const asset = (Array.isArray(data?.assets) ? data.assets : []).find((a: any) => a?.name === o.zip);
  const url = String(asset?.browser_download_url ?? "");
  const hash = /^sha256:([0-9a-f]{64})$/.exec(String(asset?.digest ?? ""))?.[1];
  if (!version || !hash || url !== `https://github.com/${OWNER}/${o.repo}/releases/download/v${version}/${o.zip}`) return null;
  return { version, url, hash };
}

// Opens Decky's own dialog to install the add-on, or to update it. Returns "none" when there is
// nothing newer, "failed" when GitHub could not be asked or has no release to trust.
export async function installAddon(o: Offer): Promise<"asked" | "none" | "failed"> {
  try {
    const release = await latest(o);
    if (!release) return "failed";
    const have = installedVersion(o.plugin);
    if (have && !isNewer(release.version, have)) return "none";
    await DeckyBackend.call("utilities/install_plugin", release.url, o.plugin, release.version, release.hash, have ? UPDATE : INSTALL);
    return "asked";
  } catch (e) {
    console.warn("[Vistazo] add-on install", e);
    return "failed";
  }
}

export function useAddonList(): { offers: OfferState[]; failed: boolean } {
  const [, set] = useState(0);
  useEffect(() => {
    const fn = () => set((n) => n + 1);
    listeners.add(fn);
    readAddonList();
    // Decky's list of plugins changes when one is installed: looked at again now and then.
    const timer = setInterval(fn, 3000);
    return () => {
      listeners.delete(fn);
      clearInterval(timer);
    };
  }, []);
  return {
    offers: offers.map((o) => ({ ...o, installed: installedVersion(o.plugin), tooNew: o.contract > CONTRACT })),
    failed,
  };
}
