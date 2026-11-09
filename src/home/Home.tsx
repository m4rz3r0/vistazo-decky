import { locale, num, t } from "../i18n";
import {
  Focusable,
  GamepadButton,
  Menu,
  MenuItem,
  Navigation,
  showContextMenu,
} from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import {
  Game,
  SHELVES,
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
import { homeCss } from "./styles";

// Image with fallbacks: tries each URL in turn, then shows `fallback`. Callers give it a key per
// game, so a new game starts again from the first URL.
function Img({
  srcs,
  className,
  fallback,
  lazy,
}: {
  srcs: string[];
  className: string;
  fallback?: any;
  lazy?: boolean;
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
      onError={() => setI(i + 1)}
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
  return t.lastPlayed(
    new Date(ts * 1000).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
  );
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

declare const SteamUIStore: any;
const isRunning = (g: Game) => {
  try {
    return (SteamUIStore?.RunningApps ?? []).some(
      (a: any) => a.appid === g.appid,
    );
  } catch {
    return false;
  }
};

const sameGames = (a: Game[], b: Game[]) =>
  a.length === b.length &&
  a.every(
    (g, i) =>
      g.appid === b[i].appid &&
      g.minutes === b[i].minutes &&
      g.lastPlayed === b[i].lastPlayed,
  );

// Remembered while Steam runs: coming back from a game page lands on the same shelf and cover.
let lastShelf: ShelfId = "installed";
const lastFocus: Partial<Record<ShelfId, number>> = {};

export function Home() {
  const [shelf, setShelf] = useState<ShelfId>(lastShelf);
  const [games, setGames] = useState<Game[]>(() => loadShelf(lastShelf));
  // Tender builds its retro collections a few seconds after boot, and games get installed or removed
  // while the home stays open: re-read the shelf when it changes, when it comes back into view, and
  // twice more shortly after if it came up empty.
  useEffect(() => {
    const reload = () => {
      const next = loadShelf(shelf);
      setGames((prev) => (sameGames(prev, next) ? prev : next));
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
  const [focused, setFocused] = useState<Game | null>(games[startAt] ?? null);
  const row = useRef<HTMLDivElement>(null);
  const onLibrary = useRef(false);

  // A refresh keeps the game on show (with its fresh playtime); if it is gone, the first cover takes over.
  useEffect(() => {
    setFocused((cur) =>
      cur
        ? (games.find((g) => g.appid === cur.appid) ?? games[0] ?? null)
        : onLibrary.current
          ? null // the "full library" tile has the focus: no game on show
          : (games[0] ?? null), // the shelf was empty and has just filled in
    );
  }, [games]);

  // L1/R1: the new shelf's games, the hero and the focus all change together, then the row scrolls home
  // and its first cover takes the focus once it has rendered.
  const focusFirst = useRef(false);
  useEffect(() => {
    lastShelf = shelf;
    if (!focusFirst.current) return;
    focusFirst.current = false;
    row.current?.scrollTo({ left: 0 });
    (row.current?.querySelector(".vh-cover") as HTMLElement | null)?.focus();
  }, [shelf]);

  const cycle = (dir: number) => {
    const i = SHELVES.findIndex((s) => s.id === shelf);
    const next = SHELVES[(i + dir + SHELVES.length) % SHELVES.length];
    const nextGames = loadShelf(next.id);
    focusFirst.current = true;
    setGames(nextGames);
    setFocused(nextGames[0] ?? null);
    setShelf(next.id);
  };

  // On the root, so L1/R1 work wherever the focus is (covers or the friends corner).
  const onButtonDown = (evt: any) => {
    const b = evt?.detail?.button;
    if (b === GamepadButton.BUMPER_LEFT) cycle(-1);
    else if (b === GamepadButton.BUMPER_RIGHT) cycle(1);
  };

  const openPage = (g: Game) => Navigation.Navigate(`/library/app/${g.appid}`);
  const openLibrary = () => Navigation.Navigate("/library");
  const meta = focused
    ? [
        focused.platform,
        hours(focused.minutes),
        since(focused.lastPlayed),
      ].filter(Boolean)
    : [];

  return (
    <Focusable
      className="vh-root"
      flow-children="column"
      onButtonDown={onButtonDown}
    >
      <style>{homeCss()}</style>
      <Friends />

      <div className="vh-stage" aria-hidden="true">
        {focused && (
          <Img
            key={`h${focused.appid}`}
            className="vh-hero"
            srcs={heroUrls(focused)}
          />
        )}
        <div className="vh-fade" />
      </div>

      <div className="vh-title">
        {focused && (
          <Img
            key={`l${focused.appid}`}
            className="vh-logo"
            srcs={logoUrls(focused)}
            fallback={<div className="vh-name">{focused.name}</div>}
          />
        )}
        {meta.length > 0 && (
          <div className="vh-meta">
            {meta.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
        )}
      </div>

      <div className="vh-shelves">
        <span className="vh-glyph">L1</span>
        {SHELVES.map((s) => (
          <span
            key={s.id}
            className={`vh-shelf${s.id === shelf ? " vh-on" : ""}`}
          >
            {s.label}
          </span>
        ))}
        <span className="vh-glyph">R1</span>
      </div>

      <Focusable
        className="vh-row"
        flow-children="row"
        ref={row as any}
      >
        {games.map((g, i) => (
          <Focusable
            key={g.appid}
            autoFocus={i === startAt}
            className="vh-cover"
            noFocusRing
            onFocus={(e: any) => {
              onLibrary.current = false;
              setFocused(g);
              lastFocus[shelf] = g.appid;
              (e.currentTarget as HTMLElement).scrollIntoView({
                behavior: "smooth",
                inline: "center",
                block: "nearest",
              });
            }}
            onActivate={() =>
              g.steam && !isRunning(g) ? launch(g) : openPage(g)
            }
            onOKActionDescription={
              !g.steam ? t.open : isRunning(g) ? t.backToGame : t.play
            }
            onSecondaryButton={g.steam ? () => openPage(g) : undefined}
            onSecondaryActionDescription={
              g.steam ? t.gamePage : undefined
            }
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
            {shelf === "retro"
              ? t.noRetroGames
              : t.noInstalledGames}
          </div>
        )}
        <Focusable
          className="vh-cover vh-library"
          noFocusRing
          onFocus={() => {
            onLibrary.current = true;
            setFocused(null);
          }}
          onActivate={openLibrary}
          onOKActionDescription={t.openLibrary}
        >
          <LibraryIcon />
          <span>{t.wholeLibrary}</span>
          <span className="vh-library-sub">{t.installNewGames}</span>
        </Focusable>
      </Focusable>
    </Focusable>
  );
}
