import { lang } from "./i18n";

// Tender's interface is English only. On a Spanish Deck its texts on the retro game page are put
// into Spanish as they are drawn: a list of the phrases Tender uses there, matched whole, so
// anything not on the list (and the game's own texts, such as achievement names) stays as it is.
// The original is kept and put back when the retro page is turned off.

const EXACT: Record<string, string> = {
  // Play row
  Play: "Jugar",
  Download: "Descargar",
  "Use Existing Files": "Usar archivos existentes",
  "Starting...": "Iniciando…",
  Paused: "En pausa",
  // Game info
  Region: "Región",
  Languages: "Idiomas",
  Platform: "Plataforma",
  "Developer / Publisher": "Desarrollador y editor",
  Genres: "Géneros",
  "Release Date": "Lanzamiento",
  "Game Modes": "Modos de juego",
  Players: "Jugadores",
  Rating: "Nota",
  "ROM File": "Archivo del juego",
  Filename: "Nombre",
  Revision: "Revisión",
  Tags: "Etiquetas",
  Spain: "España",
  Europe: "Europa",
  USA: "EE. UU.",
  Japan: "Japón",
  World: "Mundo",
  Spanish: "Español",
  English: "Inglés",
  French: "Francés",
  German: "Alemán",
  Italian: "Italiano",
  Japanese: "Japonés",
  // Saves
  active: "activo",
  server: "servidor",
  Synced: "Sincronizado",
  "Last synced:": "Sincronizado:",
  "Last updated:": "Modificado:",
  "Server save:": "En el servidor:",
  "Local path:": "En la consola:",
  "Copy to slot…": "Copiar a otra ranura…",
  "Previous Versions": "Versiones anteriores",
  "+ New Slot": "+ Ranura nueva",
  Never: "Nunca",
  "Never · (not this device) ✓": "Nunca · (no desde esta consola) ✓",
  // BIOS
  Emulator: "Emulador",
  "Active Core": "Núcleo activo",
};

// Genres and game modes come in lists ("Multiplayer, Single player"): word by word.
const WORDS: Record<string, string> = {
  "Role-playing (RPG)": "Rol",
  Sport: "Deporte",
  Adventure: "Aventura",
  Platform: "Plataformas",
  Puzzle: "Puzles",
  Shooter: "Disparos",
  Fighting: "Lucha",
  Racing: "Carreras",
  Simulator: "Simulación",
  Strategy: "Estrategia",
  "Turn-based strategy (TBS)": "Estrategia por turnos",
  "Real Time Strategy (RTS)": "Estrategia en tiempo real",
  Tactical: "Táctica",
  "Hack and slash/Beat 'em up": "Acción",
  Arcade: "Arcade",
  Music: "Música",
  Indie: "Independiente",
  "Card & Board Game": "Cartas y tablero",
  "Point-and-click": "Aventura gráfica",
  "Visual Novel": "Novela visual",
  Pinball: "Pinball",
  "Quiz/Trivia": "Preguntas",
  MOBA: "MOBA",
  Multiplayer: "Multijugador",
  "Single player": "Un jugador",
  "Co-operative": "Cooperativo",
  "Split screen": "Pantalla dividida",
};

const PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^(\d+) \/ (\d+) Achievements$/, (m) => `${m[1]} de ${m[2]} logros`],
  [/^(\d+) hardcore$/, (m) => `${m[1]} en modo difícil`],
  [/^Earned \((\d+)\)$/i, (m) => `Conseguidos (${m[1]})`],
  [/^Locked \((\d+)\)$/i, (m) => `Pendientes (${m[1]})`],
  [/^(\d+) players? earned this$/, (m) => (m[1] === "1" ? "Lo tiene 1 jugador" : `Lo tienen ${m[1]} jugadores`)],
  [/^(\d+) saves?$/, (m) => (m[1] === "1" ? "1 guardado" : `${m[1]} guardados`)],
  [
    /^(\d{4})-(\d{2})-(\d{2}) \d{2}:\d{2}$/,
    (m) => new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }),
  ],
  [/^Synced (.+)$/, (m) => `Sincronizado el ${m[1]}`],
  [/^Extracting… (\d+)%$/, (m) => `Extrayendo… ${m[1]} %`],
  [/^(.*) \(optional\)$/, (m) => `${m[1]} (opcional)`],
  [/^(.*) \(required\)$/, (m) => `${m[1]} (necesario)`],
  [
    /^(.+) marks none of its BIOS files as required \((\d+)\/(\d+) files held\)$/,
    (m) => `${m[1]} no necesita ninguno de sus archivos de BIOS (${m[2]} de ${m[3]} presentes)`,
  ],
  [
    /^(\d+) more files? an installed emulator asks for — none required for this launch, none to download; the Library page's Platforms tab lists them$/,
    (m) =>
      `Otros emuladores instalados piden ${m[1]} ${m[1] === "1" ? "archivo" : "archivos"} más: ninguno hace falta para este juego ni hay nada que descargar. Están en la pestaña Plataformas de la biblioteca.`,
  ],
];

// One phrase, or the same text when it is not one of Tender's.
export function inSpanish(text: string): string {
  if (lang !== "es") return text;
  const key = text.trim();
  if (!key) return text;
  let out = EXACT[key] ?? EXACT[key[0] + key.slice(1).toLowerCase()];
  if (out === undefined) {
    for (const [re, fn] of PATTERNS) {
      const m = re.exec(key);
      if (m) {
        out = fn(m);
        break;
      }
    }
  }
  if (out === undefined && WORDS[key]) out = WORDS[key];
  if (out === undefined && key.includes(", ")) {
    const parts = key.split(", ");
    if (parts.every((p) => WORDS[p])) out = parts.map((p) => WORDS[p]).join(", ");
  }
  return out === undefined ? text : text.replace(key, out);
}

// A genre or mode on its own (for Vistazo's own panel).
export const wordInSpanish = (w: string) => (lang === "es" ? (WORDS[w] ?? w) : w);

const originals = new WeakMap<Text, string>();
const ours = new WeakMap<Text, string>();
const touched = new Set<Text>();

function translateNode(node: Text) {
  const value = node.nodeValue ?? "";
  if (ours.get(node) === value) return; // already ours
  const out = inSpanish(value);
  if (out === value) return;
  if (!originals.has(node)) {
    // Nodes Tender has thrown away are let go of now and then.
    if (touched.size > 1500) for (const t of touched) if (!t.isConnected) touched.delete(t);
    touched.add(node);
  }
  originals.set(node, value);
  ours.set(node, out);
  node.nodeValue = out;
}

export function translateIn(root: Node | null | undefined) {
  if (lang !== "es" || !root) return;
  if (root.nodeType === 3) return translateNode(root as Text);
  const walker = root.ownerDocument!.createTreeWalker(root, 4 /* text nodes */);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    // Vistazo's own panel is already in the interface language.
    if ((n.parentElement as Element | null)?.closest?.(".vz-retro, .vz-retro-stats")) continue;
    translateNode(n as Text);
  }
}

// Keeps a part of Tender's page in Spanish as Tender redraws it.
const watchers = new WeakMap<Node, MutationObserver>();
export function keepTranslated(root: HTMLElement | null) {
  if (lang !== "es" || !root || watchers.has(root)) return;
  translateIn(root);
  const view = root.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  if (!view) return;
  const mo = new view.MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") translateIn(r.target);
      else r.addedNodes.forEach((n) => translateIn(n));
    }
  });
  mo.observe(root, { subtree: true, childList: true, characterData: true });
  watchers.set(root, mo);
  roots.add(root);
}

const roots = new Set<HTMLElement>();
// Puts Tender's own words back (the retro page was turned off, or the plugin is unloading).
export function restoreText() {
  for (const root of roots) {
    watchers.get(root)?.disconnect();
    watchers.delete(root);
  }
  roots.clear();
  for (const node of touched) {
    const original = originals.get(node);
    if (original !== undefined && node.nodeValue === ours.get(node)) node.nodeValue = original;
    originals.delete(node);
    ours.delete(node);
  }
  touched.clear();
}
