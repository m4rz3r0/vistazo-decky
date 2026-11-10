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
import { useEffect, useRef, useState } from "react";
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
import { AchievementCount, DAY, Medal, loadCount, medal, savedCount } from "../data";
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

function Friends() {
  const [status, setSt] = useState(currentStatus());
  const [online, setOnline] = useState(onlineFriends());
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return; // nobody is looking (game running, screen off)
      setSt(currentStatus());
      setOnline(onlineFriends());
    }, 15000);
    return () => clearInterval(t);
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
      onGamepadDirection={(evt: any) => {
        if (evt?.detail?.button === GamepadButton.DIR_UP) evt.preventDefault?.();
      }}
    >
      <span
        className="vh-dot vh-self"
        style={{ ["--vh-tone" as any]: me.tone }}
      />
      <span className="vh-status-label">{me.label}</span>
      <PeopleIcon />
      <span className="vh-online">{online}</span>
    </Focusable>
  );
}

// Crossfade: the new art fades in over the previous one, which stays underneath until replaced.
function Hero({ game }: { game: Game | null }) {
  const [layers, setLayers] = useState<Game[]>([]);
  useEffect(() => {
    setLayers((l) =>
      !game
        ? []
        : l[l.length - 1]?.appid === game.appid
          ? l
          : // The previous art stays under the new one while it loads; a game without art clears it.
            heroUrls(game).length
            ? [...l.slice(-1), game]
            : [game],
    );
  }, [game]);
  // The new art didn't load at all: don't leave the previous game's art on show.
  const giveUp = (appid: number) =>
    setLayers((l) => (l[l.length - 1]?.appid === appid ? l.slice(-1) : l));
  return (
    <>
      {layers.map((g) => (
        <Img key={g.appid} className="vh-hero" srcs={heroUrls(g)} onGiveUp={() => giveUp(g.appid)} />
      ))}
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
      if (document.hidden) {
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

declare const SteamUIStore: any;
const isRunning = (g: Game) =>
  safe(() => SteamUIStore.RunningApps.some((a: any) => a.appid === g.appid), false);

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

export function Home() {
  const shelves = activeShelves(useSettings().shelves);
  const [shelf, setShelf] = useState<ShelfId>(() =>
    shelves.some((s) => s.id === lastShelf) ? lastShelf : shelves[0].id,
  );
  const [games, setGames] = useState<Game[]>(() => loadShelf(shelf));
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
    const onVisible = () => !document.hidden && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shelf]);
  const startAt = Math.max(
    0,
    games.findIndex((g) => g.appid === lastFocus[shelf]),
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
  const titleRef = useRef<HTMLDivElement>(null);
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

  const openPage = (g: Game) => Navigation.Navigate(`/library/app/${g.appid}`);
  // A and X on a cover. Steam games: play (or back to the running game) and game page, swapped if the
  // player chose so. Retro games have no Steam page to open: A opens theirs, X does nothing.
  const { aOpensPage } = useSettings();
  const buttons = (g: Game) => {
    const page = { run: () => openPage(g), label: g.steam ? t.gamePage : t.open };
    if (!g.steam) return { onActivate: page.run, onOKActionDescription: page.label };
    const play = isRunning(g)
      ? { run: page.run, label: t.backToGame }
      : { run: () => launch(g), label: t.play };
    const [a, x] = aOpensPage ? [page, play] : [play, page];
    return {
      onActivate: a.run,
      onOKActionDescription: a.label,
      onSecondaryButton: x.run,
      onSecondaryActionDescription: x.label,
    };
  };
  const openLibrary = () => Navigation.Navigate("/library");
  const achievements = useAchievements(focused);
  useAchievementFill(games);
  // Each fact keeps its meaning's color: mint while the game is running; achievements take the
  // color of the medal they have reached, and all of them become a platinum emblem.
  const won = achievements ? medal(achievements.achieved, achievements.total) : null;
  type Fact = { text: string; tone?: "playing" | Medal };
  const meta: Fact[] = focused
    ? [
        isRunning(focused) ? { text: t.playingNow, tone: "playing" as const } : null,
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
        since(focused.lastPlayed) && !isRunning(focused) ? { text: since(focused.lastPlayed)! } : null,
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
          <Focusable
            key={g.appid}
            autoFocus={i === startAt}
            className="vh-cover"
            noFocusRing
            // Steam's own focus event: the browser's onFocus doesn't fire while the window isn't
            // browser-focused, but the gamepad selection still moves.
            onGamepadFocus={(e: any) => {
              setFocusedId(g.appid);
              lastFocus[shelf] = g.appid;
              centerInRow(e);
            }}
            {...buttons(g)}
            onOptionsButton={openLibrary}
            onOptionsActionDescription={t.fullLibrary}
          >
            <Img
              srcs={portraitUrls(g)}
              className="vh-art"
              lazy
              fallback={<span className="vh-art vh-noart">{g.name}</span>}
            />
          </Focusable>
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
