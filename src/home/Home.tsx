import { safe } from "../safe";
import { navFocus, wakeNavigation } from "../focus";
import { locale, num, t } from "../i18n";
import {
  Focusable,
  GamepadButton,
  Menu,
  MenuItem,
  Navigation,
  Router,
  showContextMenu,
} from "@decky/ui";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Game,
  activeShelves,
  ShelfId,
  currentStatus,
  heroUrls,
  launch,
  loadShelf,
  logoUrls,
  onlineFriends,
  portraitUrls,
  setStatus,
  statusOptions,
} from "./data";
import { homeCss, headerCss } from "./styles";
import { useSettings } from "../settings";
import { AchievementCount, DAY, Medal, loadCount, medal, runningAppIds, savedCount } from "../data";
import { PlatinumIcon } from "../gem";

// Image with fallbacks: tries each URL in turn, then shows `fallback`. Callers give it a key per
// game, so a new game starts again from the first URL.
function Img({
  srcs,
  className,
  fallback,
  lazy,
  onGiveUp,
}: {
  srcs: string[];
  className: string;
  fallback?: any;
  lazy?: boolean;
  onGiveUp?: () => void; // none of the sources loaded
}) {
  const [i, setI] = useState(0);
  if (i >= srcs.length) return fallback ?? null;
  return (
    <img
      className={className}
      src={srcs[i]}
      alt=""
      decoding="async"
      loading={lazy ? "lazy" : undefined}
      onError={() => {
        if (i + 1 >= srcs.length) onGiveUp?.();
        setI(i + 1);
      }}
      onLoad={(e) => (e.currentTarget.dataset.ready = "")} // fades in once it has loaded
    />
  );
}

function hours(min: number): string {
  if (min <= 0) return t.notPlayedYet;
  if (min < 60) return t.minutesPlayed(min);
  return t.hoursPlayed(num(min / 60, 1));
}

function since(ts: number): string | null {
  if (!ts) return null;
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days <= 0) return t.playedToday;
  if (days === 1) return t.playedYesterday;
  if (days < 30) return t.playedDaysAgo(days);
  // Short enough to keep the line whole: the day this year, the month before that.
  const date = new Date(ts * 1000);
  return date.getFullYear() === new Date().getFullYear()
    ? t.playedOn(date.toLocaleDateString(locale, { day: "numeric", month: "short" }))
    : t.playedIn(date.toLocaleDateString(locale, { month: "short", year: "numeric" }));
}

function PeopleIcon() {
  return (
    <svg className="vh-people" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 19.5c.6-3.4 3.1-5.4 6.2-5.4s5.6 2 6.2 5.4" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16.4 14.2c2.6.1 4.4 1.8 4.9 4.6" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg className="vh-lib-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="4" width="4" height="16" rx="1.2" />
      <rect x="10" y="4" width="4" height="16" rx="1.2" />
      <path d="M16.6 5.2l3.6-.9 3 15.5-3.6.8z" transform="translate(-2.2 0)" />
    </svg>
  );
}

// The home's own document. Plugins run in another window's context, whose `document` says nothing
// about whether the home is on screen.
let homeDoc: Document | null = null;
declare const SteamUIStore: any;
// Nobody is looking: the screen is off, or a game is on top (Steam hides its own window then).
const away = () =>
  (homeDoc ?? document).hidden ||
  safe(
    () =>
      SteamUIStore.WindowStore.GamepadUIMainWindowInstance.m_CompositionStateStore.GetCompositionState() === 0,
    false,
  );

// Memoised: it has no props, so moving along the covers doesn't draw it again.
const Friends = memo(function Friends() {
  const [status, setSt] = useState(currentStatus);
  const [online, setOnline] = useState(onlineFriends);
  useEffect(() => {
    const t = setInterval(() => {
      if (away()) return;
      setSt(currentStatus());
      setOnline(onlineFriends());
    }, 15000);
    return () => clearInterval(t);
  }, []);
  // And back: left from the first button of that bar comes to the corner, instead of opening
  // Steam's search box on top of it.
  const dot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const doc = dot.current?.ownerDocument;
    if (!doc) return;
    const back = (e: any) => {
      if (e?.detail?.button !== GamepadButton.DIR_LEFT) return;
      const corner = dot.current?.closest<HTMLElement>(".vh-friends");
      const btn = (e.target as Element | null)?.closest?.('[class*="2HnVd7wV6yVaTiXfrBe3gq"]');
      if (!corner || !btn || firstTopBarButton(corner) !== btn) return;
      e.stopPropagation();
      e.preventDefault();
      corner.focus();
    };
    doc.addEventListener("vgp_ondirection", back, true);
    return () => doc.removeEventListener("vgp_ondirection", back, true);
  }, []);
  const opts = statusOptions();
  const me = opts.find((o) => o.id === status) ?? opts[0];

  const openMenu = (e?: any) =>
    showContextMenu(
      <Menu label={t.yourStatus}>
        {opts.map((o) => (
          <MenuItem
            key={o.id}
            onSelected={() => {
              setStatus(o.id);
              setSt(o.id); // shown at once; the 15 s refresh corrects it if Steam refused
            }}
          >
            <span className="vh-menu-row">
              <span
                className="vh-dot"
                style={{ ["--vh-tone" as any]: o.tone }}
              />
              {o.label}
              {o.id === status && <span className="vh-menu-now">{t.current}</span>}
            </span>
          </MenuItem>
        ))}
        <MenuItem onSelected={() => Navigation.NavigateToChat()}>
          {t.friendsAndChat}
        </MenuItem>
      </Menu>,
      e?.currentTarget ?? window,
    );

  return (
    <Focusable
      className="vh-friends"
      noFocusRing
      onActivate={openMenu}
      onOKActionDescription={t.changeStatus}
      onSecondaryButton={() => Navigation.NavigateToChat()}
      onSecondaryActionDescription={t.friends}
      // The corner sits on the same line as Steam's top bar, which is focusable too: up from here
      // would land on its search button. The corner is the top of the home.
      // Steam takes what this returns as "handled": true stops the move, and anything but false
      // counts as true, so every other direction must say false or the focus is stuck here.
      // Right goes on along that bar (search, notifications, wifi, battery…): Steam doesn't find it
      // from here by itself.
      onGamepadDirection={(evt: any) => {
        const b = evt?.detail?.button;
        if (b === GamepadButton.DIR_RIGHT) return toTopBar(evt?.currentTarget ?? evt?.target);
        return b === GamepadButton.DIR_UP;
      }}
    >
      <span
        ref={dot}
        className="vh-dot vh-self"
        style={{ ["--vh-tone" as any]: me.tone }}
      />
      <span className="vh-status-label">{me.label}</span>
      <PeopleIcon />
      <span className="vh-online">{online}</span>
    </Focusable>
  );
});

// The leftmost shown button of Steam's top bar (search, notifications…) to the right of `from`.
function firstTopBarButton(from: Element): HTMLElement | null {
  const edge = from.getBoundingClientRect().right;
  let best: HTMLElement | null = null;
  let bestX = Infinity;
  from.ownerDocument.querySelectorAll<HTMLElement>('[class*="2HnVd7wV6yVaTiXfrBe3gq"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.left >= edge - 1 && r.left < bestX) {
      best = el;
      bestX = r.left;
    }
  });
  return best;
}
// Focuses it; false when there is none, so Steam moves as it would.
function toTopBar(from: Element | null | undefined): boolean {
  const btn = from ? firstTopBarButton(from) : null;
  btn?.focus();
  return !!btn;
}

// Games whose own wide art didn't load this session: they go straight to the poster.
const noHero = new Set<number>();

// Crossfade: the new art fades in over the previous one, which stays underneath until replaced.
// A game without wide art of its own shows its cover as a poster instead of an empty stage; the
// poster covers only part of the stage, so nothing of the previous game stays under it.
function Hero({ game }: { game: Game | null }) {
  const [layers, setLayers] = useState<Game[]>([]);
  useEffect(() => {
    setLayers((l) =>
      !game
        ? []
        : l[l.length - 1]?.appid === game.appid
          ? l
          : noHero.has(game.appid)
            ? [game]
            : [...l.slice(-1), game],
    );
  }, [game]);
  const toPoster = (appid: number) => {
    noHero.add(appid);
    setLayers((l) => (l[l.length - 1]?.appid === appid ? l.slice(-1) : l));
  };
  return (
    <>
      {layers.map((g) => {
        // Its own key: a poster must not inherit the failed hero's place in its list of sources.
        const poster = <Img key={`poster-${g.appid}`} className="vh-hero vh-poster" srcs={portraitUrls(g)} />;
        return noHero.has(g.appid) ? (
          poster
        ) : (
          <Img
            key={g.appid}
            className="vh-hero"
            srcs={heroUrls(g)}
            onGiveUp={() => toPoster(g.appid)}
            fallback={poster}
          />
        );
      })}
    </>
  );
}

// Achievements of the game on show: the saved count at once, then a fresh read in the background
// when there is none yet or it is more than a day old (the count only changes while playing, and a
// game closing refreshes it anyway).
function useAchievements(game: Game | null): AchievementCount | null {
  const id = game?.appid ?? 0;
  const [count, setCount] = useState<AchievementCount | null>(() => (id ? savedCount(id) : null));
  useEffect(() => {
    const saved = id ? savedCount(id) : null;
    setCount(saved);
    if (!id || (saved && Date.now() - saved.savedAt < DAY)) return;
    let live = true;
    const timer = setTimeout(() => {
      loadCount(id).then(() => live && setCount(savedCount(id)));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id]);
  return count;
}

// Fills the saved counts for the shelf's games that have none, one at a time while the home is on
// screen, so the first time a cover is selected its achievements are already there.
function useAchievementFill(games: Game[]) {
  useEffect(() => {
    const todo = games.filter((g) => !savedCount(g.appid)).map((g) => g.appid);
    if (!todo.length) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (stop || !todo.length) return;
      if (away()) {
        timer = setTimeout(next, 5000); // a game is running or the screen is off: wait
        return;
      }
      loadCount(todo.shift()!).finally(() => {
        if (!stop) timer = setTimeout(next, 250);
      });
    };
    timer = setTimeout(next, 1500); // after the home has settled
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [games]);
}

// Remembered while Steam runs: coming back from a game page lands on the same shelf and cover.
let lastShelf: ShelfId = "installed";
const lastFocus: Partial<Record<ShelfId, number>> = {};
let wokeOnce = false;


// Keeps the focused cover centred. A held stick repeats faster than a smooth scroll finishes, and
// each new smooth scroll restarts the last one, so the selection outran the row and left the
// screen: while focus moves quickly, jump straight there; a single press still glides.
let lastRowMove = 0;
function centerInRow(e: any): void {
  const now = performance.now();
  const quick = now - lastRowMove < 250;
  lastRowMove = now;
  ((e?.currentTarget ?? e?.target) as HTMLElement | null)?.scrollIntoView?.({
    behavior: quick ? "auto" : "smooth",
    inline: "center",
    block: "nearest",
  });
}

const openPage = (appid: number) => Navigation.Navigate(`/library/app/${appid}`);
const openLibrary = () => Navigation.Navigate("/library");

// One cover. Memoised: moving along the row changes which game is on show, not the covers, so a
// held stick draws nothing but the game that was reached.
// A and X: Steam games play (or go back to the running game) and open their page, swapped if the
// player chose so. Retro games have no Steam page to open: A opens theirs, X does nothing.
const Cover = memo(
  function Cover({
    game,
    first,
    running,
    aOpensPage,
    onShow,
  }: {
    game: Game;
    first: boolean;
    running: boolean;
    aOpensPage: boolean;
    onShow: (appid: number, e: any) => void;
  }) {
    const page = { run: () => openPage(game.appid), label: game.steam ? t.gamePage : t.open };
    const play = running
      ? { run: page.run, label: t.backToGame }
      : { run: () => launch(game), label: t.play };
    const [a, x] = !game.steam ? [page, null] : aOpensPage ? [page, play] : [play, page];
    return (
      <Focusable
        autoFocus={first}
        className="vh-cover"
        noFocusRing
        // Steam's own focus event: the browser's onFocus doesn't fire while the window isn't
        // browser-focused, but the gamepad selection still moves.
        onGamepadFocus={(e: any) => onShow(game.appid, e)}
        onActivate={a.run}
        onOKActionDescription={a.label}
        onSecondaryButton={x?.run}
        onSecondaryActionDescription={x?.label}
        onOptionsButton={openLibrary}
        onOptionsActionDescription={t.fullLibrary}
      >
        <Img
          srcs={portraitUrls(game)}
          className="vh-art"
          lazy
          fallback={<span className="vh-art vh-noart">{game.name}</span>}
        />
      </Focusable>
    );
  },
  (a, b) =>
    a.game.appid === b.game.appid &&
    a.game.name === b.game.name &&
    a.game.steam === b.game.steam &&
    a.first === b.first &&
    a.running === b.running &&
    a.aOpensPage === b.aOpensPage &&
    a.onShow === b.onShow,
);

export function Home() {
  const shelves = activeShelves(useSettings().shelves);
  const [shelf, setShelf] = useState<ShelfId>(() =>
    shelves.some((s) => s.id === lastShelf) ? lastShelf : shelves[0].id,
  );
  const [games, setGames] = useState<Game[]>(() => loadShelf(shelf));
  const titleRef = useRef<HTMLDivElement>(null);
  // Which way the last L1/R1 went: the new shelf slides in from that side.
  const [slide, setSlide] = useState<"" | "vh-from-left" | "vh-from-right">("");
  // Tender builds its retro collections a few seconds after boot, and games get installed or removed
  // while the home stays open: re-read the shelf when it changes, when it comes back into view, and
  // twice more shortly after if it came up empty.
  useEffect(() => {
    const reload = () => {
      // Always a fresh list: playtimes and the "back to game" hint are current again.
      const next = loadShelf(shelf);
      setGames(next);
      return next;
    };
    const timers =
      reload().length === 0
        ? [setTimeout(reload, 3000), setTimeout(reload, 10000)]
        : [];
    const doc = titleRef.current?.ownerDocument ?? document;
    const onVisible = () => !doc.hidden && reload();
    doc.addEventListener("visibilitychange", onVisible);
    return () => {
      timers.forEach(clearTimeout);
      doc.removeEventListener("visibilitychange", onVisible);
    };
  }, [shelf]);
  // The cover a shelf opens on: the one it was left on. Worked out when the shelf is read, not on
  // every move, so moving doesn't hand the "start here" mark from cover to cover.
  const startAt = useMemo(
    () =>
      Math.max(
        0,
        games.findIndex((g) => g.appid === lastFocus[shelf]),
      ),
    [games, shelf],
  );
  // The game on show is looked up by appid, so a refresh keeps it (with its fresh playtime) and a game
  // that is gone, or a new shelf, hands over to the first cover. null: the "full library" tile is selected.
  const [focusedId, setFocusedId] = useState<number | null>(games[startAt]?.appid ?? 0);
  const focused =
    focusedId === null ? null : (games.find((g) => g.appid === focusedId) ?? games[0] ?? null);

  // After Steam starts nothing is selected until the first press: wake Steam's navigation and select
  // the cover the home starts on. Once per client session, and never while a game is running (its
  // input must not be taken).
  const hasGames = games.length > 0;
  // While the home is up: its document is the one to ask whether it is on screen, and Steam's top
  // bar goes clear over the art (a mark on the page instead of a :has() rule, which the browser
  // would re-check on every change anywhere in the page).
  useLayoutEffect(() => {
    const doc = titleRef.current?.ownerDocument ?? document;
    homeDoc = doc;
    doc.documentElement.setAttribute("data-vh-home", "");
    return () => {
      doc.documentElement.removeAttribute("data-vh-home");
      if (homeDoc === doc) homeDoc = null;
    };
  }, []);
  useEffect(() => {
    if (!hasGames || wokeOnce || Router.MainRunningApp) return;
    const timer = setTimeout(() => {
      wokeOnce = true;
      if (!wakeNavigation()) return;
      // Plugins run in another window's context: look the cover up in the home's own document.
      const doc = titleRef.current?.ownerDocument ?? document;
      const cover = () => doc.querySelectorAll(".vh-row .vh-cover")[startAt];
      navFocus(cover());
    }, 400);
    return () => clearTimeout(timer);
  }, [hasGames]);

  const show = (id: ShelfId) => {
    // Each shelf comes back on the cover it was left on; its covers mount with that one autofocused.
    const nextGames = loadShelf(id);
    lastShelf = id;
    setGames(nextGames);
    setFocusedId(lastFocus[id] ?? nextGames[0]?.appid ?? 0);
    setShelf(id);
  };
  const cycle = (dir: number) => {
    const i = shelves.findIndex((s) => s.id === shelf);
    if (shelves.length > 1) setSlide(dir < 0 ? "vh-from-left" : "vh-from-right");
    show(shelves[(i + dir + shelves.length) % shelves.length].id);
  };
  // The shelf on show was turned off in the settings: move to the first one still on.
  const shelfIds = shelves.map((s) => s.id).join("|");
  useEffect(() => {
    if (!shelves.some((s) => s.id === shelf)) show(shelves[0].id);
  }, [shelfIds]);

  // On the root, so L1/R1 work wherever the focus is (covers or the friends corner).
  const onButtonDown = (evt: any) => {
    const b = evt?.detail?.button;
    if (b === GamepadButton.BUMPER_LEFT) cycle(-1);
    else if (b === GamepadButton.BUMPER_RIGHT) cycle(1);
  };

  const { aOpensPage } = useSettings();
  const onShow = useCallback(
    (appid: number, e: any) => {
      setFocusedId(appid);
      lastFocus[shelf] = appid;
      centerInRow(e);
    },
    [shelf],
  );
  const running = runningAppIds();
  const playing = !!focused && running.has(focused.appid);
  const ago = focused ? since(focused.lastPlayed) : null;
  const achievements = useAchievements(focused);
  useAchievementFill(games);
  // Each fact keeps its meaning's color: mint while the game is running; achievements take the
  // color of the medal they have reached, and all of them become a platinum emblem.
  const won = achievements ? medal(achievements.achieved, achievements.total) : null;
  type Fact = { text: string; tone?: "playing" | Medal };
  const meta: Fact[] = focused
    ? [
        playing ? { text: t.playingNow, tone: "playing" as const } : null,
        focused.platform ? { text: focused.platform } : null,
        { text: hours(focused.minutes) },
        achievements?.total
          ? {
              text:
                won === "platinum"
                  ? t.platinum
                  : t.achievementsOf(achievements.achieved, achievements.total),
              tone: won ?? undefined,
            }
          : null,
        ago && !playing ? { text: ago } : null,
      ].filter((m): m is Fact => !!m)
    : [];

  return (
    <Focusable className="vh-root" flow-children="column" onButtonDown={onButtonDown}>
      <style>{homeCss + headerCss()}</style>
      <Friends />

      <div className="vh-stage" aria-hidden="true">
        <Hero game={focused} />
        <div className="vh-fade" />
      </div>

      <div className="vh-title" ref={titleRef}>
        {focused && (
          <div key={focused.appid} className="vh-enter">
            <Img
              className="vh-logo"
              srcs={logoUrls(focused)}
              fallback={<div className="vh-name">{focused.name}</div>}
            />
            {meta.length > 0 && (
              <div className="vh-meta">
                {meta.map((m, i) => (
                  <span key={i} className={m.tone ? `vh-${m.tone}` : undefined}>
                    {m.tone === "platinum" && <PlatinumIcon />}
                    {m.text}
                  </span>
                ))}
              </div>
            )}
            {!!achievements?.total && (
              <div className={`vh-progress${won ? ` vh-${won}` : ""}`}>
                <i style={{ transform: `scaleX(${achievements.achieved / achievements.total})` }} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="vh-shelves">
        <span className="vh-glyph">L1</span>
        {shelves.map((s) => (
          <span
            key={s.id}
            className={`vh-shelf${s.id === shelf ? " vh-on" : ""}`}
          >
            {s.label}
          </span>
        ))}
        <span className="vh-glyph">R1</span>
      </div>

      <Focusable key={shelf} className={`vh-row ${slide}`} flow-children="row">
        {games.map((g, i) => (
          <Cover
            key={g.appid}
            game={g}
            first={i === startAt}
            running={running.has(g.appid)}
            aOpensPage={aOpensPage}
            onShow={onShow}
          />
        ))}
        {games.length === 0 && (
          <div className="vh-empty">
            {shelf === "retro" ? t.noRetroGames : shelf === "installed" ? t.noInstalledGames : t.emptyShelf}
          </div>
        )}
        <Focusable
          className="vh-cover vh-library"
          noFocusRing
          onGamepadFocus={(e: any) => {
            setFocusedId(null);
            centerInRow(e);
          }}
          onActivate={openLibrary}
          onOKActionDescription={t.openLibrary}
        >
          <LibraryIcon />
          <span>{t.wholeLibrary}</span>
        </Focusable>
      </Focusable>
    </Focusable>
  );
}
