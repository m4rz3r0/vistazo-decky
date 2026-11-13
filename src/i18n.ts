import { safe } from "./safe";
import { scopeNames } from "./romm";
// Interface text in Spanish or English, following Steam's own interface language
// (Spanish for any Spanish locale, English for everything else).
declare const LocalizationManager: any;

const steamLanguage = safe(() => String(LocalizationManager.m_rgLocalesToUse[0] ?? ""), "");
export const lang: "es" | "en" =
  /^es|^latam|spanish/i.test(steamLanguage || navigator.language) ? "es" : "en";
export const locale = lang === "es" ? "es-ES" : "en-US";

export const num = (n: number, digits = 0) =>
  n.toLocaleString(locale, { maximumFractionDigits: digits });

const es = {
  // Game page
  deckVerified: "Verificado",
  deckPlayable: "Jugable",
  deckUnsupported: "No compatible",
  tierNative: "Nativo",
  tierPlatinum: "Platino",
  tierGold: "Oro",
  tierSilver: "Plata",
  tierBronze: "Bronce",
  tierBorked: "Roto",
  tierPending: "Sin datos",
  seeAllAchievements: "Ver todos los logros",
  achievements: "logros",
  platinum: "Platino",
  progressSoFar: (p: string) => `Llevas el ${p}`,
  upNext: "Los siguientes",
  rarest: "Tu logro más raro",
  players: "Jugadores",
  hiddenLeft: (n: number) =>
    n === 1
      ? "Queda 1 logro, oculto hasta conseguirlo"
      : `Quedan ${n} logros, ocultos hasta conseguirlos`,
  allEarned: "Todos los logros conseguidos",
  noAchievements: "Sin logros de Steam",
  achievementsUnavailable: "Los logros no se pueden leer ahora",
  loadingAchievements: "Cargando logros…",
  genre: "Género",
  year: "Año",
  onDisk: "En disco",
  lastTwoWeeks: "Últimas 2 semanas",
  readAll: "Leer entera",
  readLess: "Recoger",
  hiddenAchievement: "Logro oculto",
  hiddenAchievementDesc: "Se desvela al conseguirlo.",
  // Home
  installed: "Instalados",
  retro: "Retro",
  notPlayedYet: "Sin jugar todavía",
  minutesPlayed: (m: number) => `${m} min ${m === 1 ? "jugado" : "jugados"}`,
  hoursPlayed: (h: string) => `${h} h ${h === "1" ? "jugada" : "jugadas"}`,
  playedToday: "Jugado hoy",
  playedYesterday: "Jugado ayer",
  playedDaysAgo: (d: number) => `Jugado hace ${d} días`,
  playedOn: (date: string) => `Jugado el ${date}`,
  playedIn: (month: string) => `Jugado en ${month}`,
  playingNow: "Jugando ahora",
  achievementsOf: (got: number, total: number) => `${got}/${total} logros`,
  yourStatus: "Tu estado",
  current: "actual",
  friendsAndChat: "Ver amigos y chat",
  changeStatus: "Cambiar tu estado",
  friends: "Amigos",
  open: "Abrir",
  backToGame: "Volver al juego",
  play: "Jugar",
  gamePage: "Ficha del juego",
  fullLibrary: "Biblioteca completa",
  openLibrary: "Abrir la biblioteca",
  wholeLibrary: "Toda la biblioteca",
  noRetroGames: "Aún no hay juegos retro en la Deck.",
  noInstalledGames: "No hay juegos instalados.",
  emptyShelf: "Esta estantería está vacía.",
  online: "Conectado",
  away: "Ausente",
  doNotDisturb: "No molestar",
  invisible: "Invisible",
  offline: "Desconectado",
  // Settings
  homeSection: "Inicio",
  pageSection: "Ficha del juego",
  homeLabel: "Portadas y arte del juego",
  homeDesc: "En lugar del inicio de Steam.",
  pageLabel: "Logros y datos",
  pageDesc: "Arriba en la ficha, sin pestañas.",
  aOpensPageLabel: "Intercambiar A y X",
  aOpensPageDesc: "A abre la ficha y X juega.",
  protonLabel: "Nota de ProtonDB",
  protonDesc: "Cómo va cada juego en Linux.",
  shelvesSection: "Estanterías",
  installedDesc: "Juegos de Steam en la Deck.",
  retroDesc: "Juegos de RomM.",
  collectionDesc: "Colección de Steam.",
  needsHome: "Necesita «Portadas y arte del juego».",
  needsPage: "Necesita «Logros y datos».",
  lastShelf: "Siempre queda al menos una.",
  sound: "Sonido",
  soundsLabel: "Tonos suaves",
  soundsDesc: "En lugar de los sonidos de Steam.",
  playSample: "Escuchar",
  themeSection: "Tema",
  themeLabel: "Obsidiana en toda la consola",
  themeDesc: "Negro puro y un tono vivo en lo que se puede pulsar.",
  colorLabel: "Color",
  colorDesc: "De la selección y los botones principales.",
  colorNames: { Lima: "Lima", Fucsia: "Fucsia", Azul: "Azul", Sobrio: "Blanco" } as Record<string, string>,
  largeTextLabel: "Texto grande",
  largeTextDesc: "Ajustes y menús más fáciles de leer.",
  motionLabel: "Movimiento",
  motionDesc: "Las portadas crecen al elegirlas y los cambios se suavizan.",
  needsLoader: "Necesita CSS Loader, de la tienda de Decky.",
  themeMissing: "No se pudo instalar. Reinicia Decky para reintentarlo.",
  updateSection: "Versión",
  updatesLabel: "Avisar de versiones nuevas",
  updatesDesc: "Lo consulta en GitHub una vez al día.",
  versionLine: (v: string) => `Vistazo ${v}`.trim(),
  upToDate: "Es la más reciente.",
  updateChecking: "Buscando…",
  updateFailed: "No se pudo consultar. Revisa la conexión.",
  updateFound: (v: string) => `Hay una nueva: ${v}.`,
  updateNow: (v: string) => `Actualizar a ${v}`,
  updateCheck: "Buscar ahora",
  updateToastTitle: (v: string) => `Vistazo ${v} disponible`,
  updateToastBody: "Pulsa para actualizar.",
  // RomM key for achievements after a game
  rommLabel: "Logros al terminar de jugar",
  rommUnlinked: "Para verlos nada más cerrar un juego retro, Vistazo pide a RomM que los vuelva a leer. Necesita su propia clave de RomM.",
  rommLinked: "Conectado: al cerrar un juego retro, sus logros se actualizan.",
  rommMoved: "RomM tiene otra dirección en Tender: vuelve a conectar.",
  rommPair: "Conectar con RomM",
  rommUnlink: "Desconectar",
  rommPairSteps:
    "En RomM, en Ajustes › Client API Tokens, crea una clave con solo el permiso Me (read y write) y pulsa «Emparejar dispositivo». Escribe aquí el código que aparece: caduca en un minuto.",
  rommCode: "Código",
  rommAsking: "Preguntando a RomM…",
  rommDone: "Hecho",
  rommAsleep: "Conectado, pero RomM no responde ahora mismo.",
  rommDropped: "RomM ya no acepta la clave que había: vuelve a conectar.",
  rommAnswer: (a: { result: string; missing: string[]; extra: string[] }, games: boolean) => {
    switch (a.result) {
      case "ok":
        return games ? "Conectado: juegos y logros." : "Conectado: los logros se actualizarán al cerrar un juego.";
      case "limited":
        return `Conectado, pero solo para los logros. Para llevar los juegos a la clave le falta: ${scopeNames(a.missing)}. Crea otra con todo y vuelve a conectar.`;
      case "code":
        return "El código tiene 8 letras y números.";
      case "invalid":
        return "RomM no reconoce ese código: es incorrecto o ha caducado (dura un minuto). Pide otro.";
      case "scopes":
        return a.extra.length
          ? `Esa clave puede hacer más de lo que Vistazo debe tener: ${scopeNames(a.extra)}. Se ha borrado en RomM; crea otra sin eso.`
          : `A esa clave le falta: ${scopeNames(a.missing)}. Se ha borrado en RomM; crea otra.`;
      case "no-server":
        return "Tender no tiene RomM configurado.";
      case "unreachable":
        return "RomM no responde. Si estaba dormido, tarda un poco en arrancar: pide otro código y prueba de nuevo.";
      case "busy":
        return "RomM pide esperar un momento antes de probar otro código.";
      default:
        return "No se pudo conectar. El código ya no vale: pide otro.";
    }
  },
  // Vistazo looking after RomM games itself
  ownGamesLabel: "Juegos con Vistazo",
  ownGamesDesc: "Vistazo descarga e inicia por sí mismo los juegos de RomM que le pases, uno a uno. En pruebas.",
  needsRetro: "Necesita la ficha de juegos retro.",
  rommLabelGames: "Conexión con RomM",
  rommUnlinkedGames: "Para ver los juegos, descargarlos y actualizar sus logros, Vistazo necesita su propia clave de RomM.",
  rommLinkedGames: "Conectado: juegos y logros.",
  rommLimited: "Conectado solo para los logros. Para llevar los juegos hace falta otra clave: vuelve a conectar.",
  rommAgain: "Conectar de nuevo",
  rommPairStepsGames:
    "En RomM, en Ajustes › Client API Tokens, crea una clave con estos permisos: Assets (read y write), Collections (read), Firmware (read), Me (read y write), Platforms (read) y Roms (read). Pulsa «Emparejar dispositivo» y escribe aquí el código que aparece: caduca en un minuto.",
  ownName: (game: string) => `${game} · Vistazo`,
  ownOffer:
    "Crea en Steam una segunda entrada de este juego, a cargo de Vistazo: la descarga de RomM y la inicia. La de Tender sigue igual. Las dos usan la misma partida guardada, y Tender no sincroniza lo que juegues desde la de Vistazo.",
  ownAdd: "Pasarlo a Vistazo",
  ownRemove: "Quitar la entrada de Vistazo",
  ownDownload: "Descargar de nuevo",
  ownDownloading: (p: number) => `Descargando: ${p} %`,
  ownReady: "Listo: está en tu biblioteca, entre los juegos que no son de Steam.",
  ownNoFile: "La entrada está creada, pero falta el juego.",
  ownWhy: (why: string) =>
    (({
      unreachable: "RomM no responde o la descarga se cortó. Prueba otra vez.",
      refused: "RomM ha rechazado la clave: vuelve a conectar.",
      unlinked: "Falta conectar con RomM.",
      limited: "La conexión con RomM solo sirve para los logros: vuelve a conectar.",
      moved: "RomM tiene otra dirección en Tender: vuelve a conectar.",
      space: "No hay sitio en el disco.",
      exists: "Ya hay otro archivo con ese nombre en la carpeta del juego. No se ha tocado.",
      system: "Vistazo aún no sabe dónde guarda RetroDECK los juegos de esta consola.",
      retrodeck: "No se encuentra la carpeta de juegos de RetroDECK.",
      archive: "El juego llegó en un archivo que no se pudo abrir.",
      disk: "No se pudo escribir en el disco.",
      busy: "Hay una descarga en marcha.",
      steam: "Steam no dejó crear la entrada.",
      game: "RomM no tiene ese juego.",
    }) as Record<string, string>)[why] ?? "No se pudo completar.",
  // Retro game page (RomM games, with Tender)
  retroPageLabel: "Ficha de juegos retro",
  retroPageDesc: "Logros y datos en los juegos de RomM. Sin esto, la ficha original de Tender.",
  retroPlatform: "Plataforma",
  retroRating: "Nota",
  retroSave: "Guardado",
  retroSaveSynced: "Sincronizado",
  retroSaveConflict: "En conflicto",
  retroBios: "BIOS",
  retroBiosOk: "Completa",
  retroBiosMissing: "Incompleta",
  retroHardcore: (n: number) => `${n} en modo difícil`,
  retroHave: "Los tienen",
  retroPlayers: (n: string) => `${n} jugadores`,
  retroTabInfo: "Descripción",
  retroSee: "Ver",
  retroFilter: { all: "Todos", earned: "Conseguidos", locked: "Pendientes" } as Record<string, string>,
  retroOrder: { game: "Orden del juego", common: "Más comunes", rare: "Más raros", points: "Más puntos" } as Record<string, string>,
  retroTabAchievements: "Logros",
  retroTabSaves: "Guardados",
  lastSession: "Última sesión",
  playtime: "Tiempo de juego",
  sessionToday: "hoy",
  sessionYesterday: "ayer",
  sessionDaysAgo: (d: number) => `hace ${d} días`,
  sessionNever: "sin jugar",
};

const en: typeof es = {
  deckVerified: "Verified",
  deckPlayable: "Playable",
  deckUnsupported: "Unsupported",
  tierNative: "Native",
  tierPlatinum: "Platinum",
  tierGold: "Gold",
  tierSilver: "Silver",
  tierBronze: "Bronze",
  tierBorked: "Borked",
  tierPending: "Pending",
  seeAllAchievements: "See all achievements",
  achievements: "achievements",
  platinum: "Platinum",
  progressSoFar: (p) => `${p} done`,
  upNext: "Up next",
  rarest: "Your rarest one",
  players: "Players",
  hiddenLeft: (n) =>
    n === 1 ? "1 achievement left, hidden until earned" : `${n} achievements left, hidden until earned`,
  allEarned: "Every achievement earned",
  noAchievements: "No Steam achievements",
  achievementsUnavailable: "Achievements can't be read right now",
  loadingAchievements: "Loading achievements…",
  genre: "Genre",
  year: "Year",
  onDisk: "On disk",
  lastTwoWeeks: "Last 2 weeks",
  readAll: "Read it all",
  readLess: "Fold",
  hiddenAchievement: "Hidden achievement",
  hiddenAchievementDesc: "Revealed once you earn it.",
  installed: "Installed",
  retro: "Retro",
  notPlayedYet: "Not played yet",
  minutesPlayed: (m) => `${m} min played`,
  hoursPlayed: (h) => `${h} h played`,
  playedToday: "Played today",
  playedYesterday: "Played yesterday",
  playedDaysAgo: (d) => `Played ${d} days ago`,
  playedOn: (date) => `Played on ${date}`,
  playedIn: (month) => `Played in ${month}`,
  playingNow: "Playing now",
  achievementsOf: (got, total) => `${got}/${total} achievements`,
  yourStatus: "Your status",
  current: "current",
  friendsAndChat: "Friends and chat",
  changeStatus: "Change your status",
  friends: "Friends",
  open: "Open",
  backToGame: "Back to game",
  play: "Play",
  gamePage: "Game page",
  fullLibrary: "Full library",
  openLibrary: "Open the library",
  wholeLibrary: "Full library",
  noRetroGames: "No retro games on this Deck yet.",
  noInstalledGames: "No games installed.",
  emptyShelf: "This shelf is empty.",
  online: "Online",
  away: "Away",
  doNotDisturb: "Do not disturb",
  invisible: "Invisible",
  offline: "Offline",
  homeSection: "Home",
  pageSection: "Game page",
  homeLabel: "Covers and game art",
  homeDesc: "Instead of Steam's home screen.",
  pageLabel: "Achievements and facts",
  pageDesc: "At the top of the game page, no tabs.",
  aOpensPageLabel: "Swap A and X",
  aOpensPageDesc: "A opens the page and X plays.",
  protonLabel: "ProtonDB rating",
  protonDesc: "How each game runs on Linux.",
  shelvesSection: "Shelves",
  installedDesc: "Steam games on this Deck.",
  retroDesc: "RomM games.",
  collectionDesc: "Steam collection.",
  needsHome: "Needs “Covers and game art”.",
  needsPage: "Needs “Achievements and facts”.",
  lastShelf: "At least one stays on.",
  sound: "Sound",
  soundsLabel: "Soft tones",
  soundsDesc: "Instead of Steam's menu sounds.",
  playSample: "Listen",
  themeSection: "Theme",
  themeLabel: "Obsidiana everywhere",
  themeDesc: "True black, and one vivid color for what you can press.",
  colorLabel: "Color",
  colorDesc: "For the selection and main buttons.",
  colorNames: { Lima: "Lime", Fucsia: "Fuchsia", Azul: "Blue", Sobrio: "White" },
  largeTextLabel: "Larger text",
  largeTextDesc: "Settings and menus easier to read.",
  motionLabel: "Motion",
  motionDesc: "Covers grow when chosen and changes ease in.",
  needsLoader: "Needs CSS Loader, from the Decky store.",
  themeMissing: "Couldn't install it. Restart Decky to try again.",
  updateSection: "Version",
  updatesLabel: "Tell me about new versions",
  updatesDesc: "Checks GitHub once a day.",
  versionLine: (v: string) => `Vistazo ${v}`.trim(),
  upToDate: "It's the latest.",
  updateChecking: "Checking…",
  updateFailed: "Couldn't check. Look at the connection.",
  updateFound: (v: string) => `There's a new one: ${v}.`,
  updateNow: (v: string) => `Update to ${v}`,
  updateCheck: "Check now",
  updateToastTitle: (v: string) => `Vistazo ${v} is out`,
  updateToastBody: "Press to update.",
  // RomM key for achievements after a game
  rommLabel: "Achievements after playing",
  rommUnlinked: "To see them as soon as a retro game closes, Vistazo asks RomM to read them again. It needs its own RomM key.",
  rommLinked: "Connected: when a retro game closes, its achievements are updated.",
  rommMoved: "Tender points to another RomM address: connect again.",
  rommPair: "Connect to RomM",
  rommUnlink: "Disconnect",
  rommPairSteps:
    "In RomM, under Settings › Client API Tokens, create a token with only the Me permission (read and write) and press “Pair device”. Type the code it shows here: it expires in a minute.",
  rommCode: "Code",
  rommAsking: "Asking RomM…",
  rommDone: "Done",
  rommAsleep: "Connected, but RomM is not answering right now.",
  rommDropped: "RomM no longer accepts the key that was here: connect again.",
  rommAnswer: (a: { result: string; missing: string[]; extra: string[] }, games: boolean) => {
    switch (a.result) {
      case "ok":
        return games ? "Connected: games and achievements." : "Connected: achievements will update when a game closes.";
      case "limited":
        return `Connected, but for achievements only. To run the games the key lacks: ${scopeNames(a.missing)}. Create another with everything and connect again.`;
      case "code":
        return "The code is 8 letters and numbers.";
      case "invalid":
        return "RomM does not know that code: it is wrong or has expired (it lasts a minute). Get another.";
      case "scopes":
        return a.extra.length
          ? `That key can do more than Vistazo should hold: ${scopeNames(a.extra)}. It was deleted in RomM; create another without those.`
          : `That key lacks: ${scopeNames(a.missing)}. It was deleted in RomM; create another.`;
      case "no-server":
        return "Tender has no RomM set up.";
      case "unreachable":
        return "RomM is not answering. If it was asleep it takes a while to start: get another code and try again.";
      case "busy":
        return "RomM asks to wait a moment before trying another code.";
      default:
        return "Could not connect. The code is used up: get another.";
    }
  },
  // Vistazo looking after RomM games itself
  ownGamesLabel: "Games by Vistazo",
  ownGamesDesc: "Vistazo downloads and starts the RomM games you hand it by itself, one at a time. Experimental.",
  needsRetro: "Needs the retro game page.",
  rommLabelGames: "RomM connection",
  rommUnlinkedGames: "To see the games, download them and update their achievements, Vistazo needs its own RomM key.",
  rommLinkedGames: "Connected: games and achievements.",
  rommLimited: "Connected for achievements only. Running the games needs another key: connect again.",
  rommAgain: "Connect again",
  rommPairStepsGames:
    "In RomM, under Settings › Client API Tokens, create a token with these permissions: Assets (read and write), Collections (read), Firmware (read), Me (read and write), Platforms (read) and Roms (read). Press “Pair device” and type the code it shows here: it expires in a minute.",
  ownName: (game: string) => `${game} · Vistazo`,
  ownOffer:
    "Adds a second entry of this game to Steam, run by Vistazo: it downloads it from RomM and starts it. Tender's entry stays as it is. Both use the same save, and Tender does not sync what you play from Vistazo's.",
  ownAdd: "Hand it to Vistazo",
  ownRemove: "Remove Vistazo's entry",
  ownDownload: "Download again",
  ownDownloading: (p: number) => `Downloading: ${p}%`,
  ownReady: "Ready: it is in your library, among the non-Steam games.",
  ownNoFile: "The entry is there, but the game is missing.",
  ownWhy: (why: string) =>
    (({
      unreachable: "RomM is not answering or the download was cut short. Try again.",
      refused: "RomM refused the key: connect again.",
      unlinked: "Connect to RomM first.",
      limited: "The RomM connection is for achievements only: connect again.",
      moved: "Tender points to another RomM address: connect again.",
      space: "There is no room on the disk.",
      exists: "Another file with that name is already in the game's folder. It was left alone.",
      system: "Vistazo does not know yet where RetroDECK keeps this console's games.",
      retrodeck: "RetroDECK's games folder was not found.",
      archive: "The game came in an archive that could not be opened.",
      disk: "The disk could not be written.",
      busy: "A download is under way.",
      steam: "Steam did not let the entry be made.",
      game: "RomM does not have that game.",
    }) as Record<string, string>)[why] ?? "It could not be completed.",
  // Retro game page (RomM games, with Tender)
  retroPageLabel: "Retro game page",
  retroPageDesc: "Achievements and facts on RomM games. Off: Tender's own page.",
  retroPlatform: "Platform",
  retroRating: "Rating",
  retroSave: "Save",
  retroSaveSynced: "Synced",
  retroSaveConflict: "In conflict",
  retroBios: "BIOS",
  retroBiosOk: "Complete",
  retroBiosMissing: "Incomplete",
  retroHardcore: (n: number) => `${n} in hardcore`,
  retroHave: "Earned by",
  retroPlayers: (n: string) => `${n} players`,
  retroTabInfo: "Description",
  retroSee: "See",
  retroFilter: { all: "All", earned: "Earned", locked: "Pending" } as Record<string, string>,
  retroOrder: { game: "Game order", common: "Most common", rare: "Rarest", points: "Most points" } as Record<string, string>,
  retroTabAchievements: "Achievements",
  retroTabSaves: "Saves",
  lastSession: "Last session",
  playtime: "Play time",
  sessionToday: "today",
  sessionYesterday: "yesterday",
  sessionDaysAgo: (d: number) => `${d} days ago`,
  sessionNever: "not played",
};

export const t = lang === "es" ? es : en;
