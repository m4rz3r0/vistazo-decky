import { safe } from "./safe";
import { findModuleChild } from "@decky/ui";

// Calm menu sounds. Every UI sound in Steam goes through one player that fetches "/sounds/<name>.wav";
// we hand it our own sound instead. Ours are synthesised here (soft sine tones and bells, no files),
// and play through Steam's own audio output, so its volume, output device and "UI sounds" switch still apply.

const RATE = 48000;

interface Tone {
  f: number; // start frequency (Hz)
  to?: number; // glide to this frequency
  at?: number; // start time (s)
  g?: number; // relative gain
  attack?: number; // s
  decay: number; // exponential decay time constant (s)
}
interface Air {
  from: number; // low-pass cutoff at start (Hz)
  to: number; // cutoff at end (Hz)
  at?: number;
  g?: number;
  len: number; // s
}
interface Spec {
  tones?: Tone[];
  air?: Air[];
  bells?: Tone[]; // a tone plus two inharmonic partials
  peak: number; // final loudness (0..1)
}

function render(spec: Spec): Float32Array<ArrayBuffer> {
  const tones: Tone[] = [...(spec.tones ?? [])];
  for (const b of spec.bells ?? []) {
    tones.push(b);
    tones.push({ ...b, f: b.f * 2.76, to: undefined, g: (b.g ?? 1) * 0.22, decay: b.decay * 0.45 });
    tones.push({ ...b, f: b.f * 5.4, to: undefined, g: (b.g ?? 1) * 0.06, decay: b.decay * 0.25 });
  }
  const end = Math.max(
    0.02,
    ...tones.map((t) => (t.at ?? 0) + (t.attack ?? 0.004) + t.decay * 6),
    ...(spec.air ?? []).map((a) => (a.at ?? 0) + a.len),
  );
  const n = Math.ceil(end * RATE);
  const out = new Float32Array(n);

  for (const t of tones) {
    const start = Math.floor((t.at ?? 0) * RATE);
    const attack = t.attack ?? 0.004;
    const len = Math.min(n - start, Math.ceil((attack + t.decay * 6) * RATE));
    const g = t.g ?? 1;
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const s = i / RATE;
      const k = len > 1 ? i / (len - 1) : 0;
      const f = t.to ? t.f * Math.pow(t.to / t.f, Math.min(1, s / (attack + t.decay * 2))) : t.f;
      phase += (2 * Math.PI * f) / RATE;
      const env = s < attack ? s / attack : Math.exp(-(s - attack) / t.decay);
      out[start + i] += Math.sin(phase) * env * g * (1 - k * k * k); // gentle fade to zero, no click
    }
  }

  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const a of spec.air ?? []) {
    const start = Math.floor((a.at ?? 0) * RATE);
    const len = Math.min(n - start, Math.ceil(a.len * RATE));
    let y = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const fc = a.from * Math.pow(a.to / a.from, k);
      const alpha = 1 - Math.exp((-2 * Math.PI * fc) / RATE);
      y += alpha * (noise() - y);
      out[start + i] += y * Math.sin(Math.PI * k) * (a.g ?? 1);
    }
  }

  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(out[i]));
  if (max > 0) for (let i = 0; i < n; i++) out[i] *= spec.peak / max;
  return out;
}

// Pitches: a pentatonic set around A5, so any two sounds heard together stay consonant.
const tick = (f: number, peak: number): Spec => ({
  tones: [{ f, decay: 0.012 }, { f: f / 2, g: 0.35, decay: 0.018 }],
  peak,
});
const pair = (a: number, b: number, peak: number, gap = 0.06): Spec => ({
  tones: [
    { f: a, decay: 0.05 },
    { f: b, at: gap, decay: 0.09 },
  ],
  peak,
});
const sweep = (from: number, to: number, airFrom: number, airTo: number): Spec => ({
  tones: [{ f: from, to, attack: 0.02, decay: 0.05, g: 0.6 }],
  air: [{ from: airFrom, to: airTo, len: 0.16, g: 0.5 }],
  peak: 0.16,
});

const bump: Spec = { tones: [{ f: 196, decay: 0.03 }], peak: 0.22 };
const toast: Spec = { bells: [{ f: 1319, decay: 0.16 }, { f: 1760, at: 0.08, decay: 0.22, g: 0.8 }], peak: 0.24 };

const SPECS: Record<string, Spec> = {
  deck_ui_navigation: tick(1320, 0.2),
  deck_ui_tile_scroll: tick(1175, 0.14),
  deck_ui_misc_01: tick(1320, 0.16),
  deck_ui_misc_08: tick(1175, 0.16),
  deck_ui_misc_10: tick(1047, 0.16),
  deck_ui_volume: tick(1047, 0.16),
  deck_ui_slider_up: tick(1320, 0.12),
  deck_ui_slider_down: tick(1175, 0.12),
  deck_ui_typing: { tones: [{ f: 2349, decay: 0.006 }], peak: 0.08 },
  pop_sound: tick(880, 0.2),
  deck_ui_default_activation: pair(880, 1320, 0.26),
  confirmation_positive: pair(784, 1175, 0.28),
  confirmation_negative: {
    tones: [
      { f: 392, decay: 0.06 },
      { f: 330, at: 0.08, decay: 0.12 },
    ],
    peak: 0.24,
  },
  deck_ui_switch_toggle_on: pair(1047, 1568, 0.18, 0.035),
  deck_ui_switch_toggle_off: pair(1568, 1047, 0.18, 0.035),
  deck_ui_bumper_end: bump,
  deck_ui_bumper_end_02: bump,
  bumper_end: bump,
  deck_ui_tab_transition_01: {
    tones: [{ f: 988, decay: 0.03, g: 0.7 }],
    air: [{ from: 600, to: 2400, len: 0.1, g: 0.4 }],
    peak: 0.14,
  },
  deck_ui_show_modal: sweep(587, 880, 400, 2000),
  deck_ui_hide_modal: sweep(880, 587, 2000, 400),
  deck_ui_side_menu_fly_in: sweep(659, 988, 300, 2400),
  deck_ui_side_menu_fly_out: sweep(988, 659, 2400, 300),
  deck_ui_into_game_detail: {
    tones: [
      { f: 659, attack: 0.012, decay: 0.12 },
      { f: 988, attack: 0.012, at: 0.04, decay: 0.14, g: 0.7 },
    ],
    peak: 0.2,
  },
  deck_ui_out_of_game_detail: {
    tones: [
      { f: 988, attack: 0.01, decay: 0.08, g: 0.7 },
      { f: 659, attack: 0.01, at: 0.04, decay: 0.1 },
    ],
    peak: 0.18,
  },
  deck_ui_launch_game: {
    bells: [
      { f: 523, decay: 0.35 },
      { f: 659, at: 0.09, decay: 0.35, g: 0.9 },
      { f: 784, at: 0.18, decay: 0.4, g: 0.8 },
      { f: 1047, at: 0.27, decay: 0.6, g: 0.7 },
    ],
    peak: 0.32,
  },
  deck_ui_toast: toast,
  deck_ui_message_toast: { bells: [{ f: 1175, decay: 0.14 }, { f: 1568, at: 0.07, decay: 0.2, g: 0.8 }], peak: 0.24 },
  desktop_toast_default: toast,
  desktop_toast_short: { bells: [{ f: 1319, decay: 0.12 }], peak: 0.22 },
  deck_ui_achievement_toast: {
    bells: [
      { f: 784, decay: 0.3 },
      { f: 1175, at: 0.1, decay: 0.35, g: 0.85 },
      { f: 1568, at: 0.2, decay: 0.6, g: 0.75 },
    ],
    peak: 0.3,
  },
};

const buffers = new Map<string, AudioBuffer>();
function bufferFor(name: string): AudioBuffer | null {
  const spec = SPECS[name];
  if (!spec) return null;
  let b = buffers.get(name);
  if (!b) {
    const data = render(spec);
    b = new AudioBuffer({ length: data.length, sampleRate: RATE, numberOfChannels: 1 });
    b.copyToChannel(data, 0);
    buffers.set(name, b);
  }
  return b;
}

// Steam's player only loads files from its own folder, so ours go straight to its output:
// same audio context and destination, hence the same volume and device.
function play(name: string) {
  const buf = bufferFor(name);
  if (!buf || !manager) return null;
  let src: AudioBufferSourceNode | null = null;
  let stopped = false;
  const mg = manager;
  Promise.resolve(mg.CreateContextIfNeeded?.())
    .then(() => mg.GetActiveDestination())
    .then((dest: AudioNode) => {
      if (stopped || !mg.context) return;
      src = mg.context.createBufferSource() as AudioBufferSourceNode;
      src.buffer = buf;
      src.connect(dest);
      src.onended = () => src?.disconnect();
      src.start(0);
    })
    .catch(() => {});
  // Shaped like Steam's playback handle, in case a caller stops it.
  return {
    url: `/sounds/${name}.wav`,
    StopPlayback() {
      stopped = true;
      try {
        src?.stop(0);
      } catch {
        /* already ended */
      }
    },
  };
}

declare const settingsStore: any;
// Steam's own "UI sounds" switch: when it is off we leave every call to Steam untouched.
const uiSoundsEnabled = () => safe(() => settingsStore.m_ClientSettings.enable_ui_sounds !== false, true);

const nameOf = (url: string) => /\/sounds\/([^/?#]+)\.wav(?:[?#]|$)/.exec(url)?.[1] ?? null;

let manager: any = null;

const findManager = () =>
  safe(
    () =>
      findModuleChild((mod: any) => {
        if (!mod || typeof mod !== "object") return undefined;
        for (const k in mod) if (mod[k]?.GamepadUIAudio?.m_AudioPlaybackManager) return mod[k];
        return undefined;
      })?.GamepadUIAudio?.m_AudioPlaybackManager,
    null,
  );

// Swap Steam's sound for ours while `on`; uninstall restores whatever was there before.
export function installSounds(isOn: () => boolean): () => void {
  manager = findManager();
  // Everything play() needs: if a Steam update renames any of it, Steam keeps its own sounds.
  if (typeof manager?.PlayAudioURLWithRepeats !== "function" || typeof manager.GetActiveDestination !== "function") {
    console.warn("[Vistazo] sound player not found; Steam's sounds stay");
    return () => {};
  }
  const previous = Object.getOwnPropertyDescriptor(manager, "PlayAudioURLWithRepeats");
  const orig = manager.PlayAudioURLWithRepeats;
  const w = function (this: any, url: any, ...rest: any[]) {
    try {
      if (isOn() && uiSoundsEnabled() && typeof url === "string" && !rest[0]) {
        const name = nameOf(url);
        const handle = name ? play(name) : null; // null when we have no sound of that name
        if (handle) return handle;
      }
    } catch (e) {
      console.error("[Vistazo] sound", e); // fall back to Steam's own sound
    }
    return orig.call(this, url, ...rest);
  };
  manager.PlayAudioURLWithRepeats = w;
  return () => {
    if (manager && manager.PlayAudioURLWithRepeats === w) {
      if (previous) Object.defineProperty(manager, "PlayAudioURLWithRepeats", previous);
      else delete manager.PlayAudioURLWithRepeats;
    }
    manager = null;
    buffers.clear();
  };
}

// A short sample for the settings screen: move, confirm, open a menu, launch.
export function playSample() {
  const seq: [string, number][] = [
    ["deck_ui_navigation", 0],
    ["deck_ui_navigation", 160],
    ["deck_ui_default_activation", 360],
    ["deck_ui_show_modal", 700],
    ["deck_ui_launch_game", 1100],
  ];
  for (const [name, ms] of seq) setTimeout(() => play(name), ms);
}
