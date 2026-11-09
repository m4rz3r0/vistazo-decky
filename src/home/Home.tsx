import { safe } from "../safe";
import { locale, num, t } from "../i18n";
import {
  Focusable,
  GamepadButton,
  Menu,
  MenuItem,
  Navigation,
  showContextMenu,
} from "@decky/ui";
import { useEffect, useState } from "react";
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
import { homeCss } from "./styles";
import { useSettings } from "../settings";

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

// Crossfade: the new art fades in over the previous one, which stays underneath until replaced.
function Hero({ game }: { game: Game | null }) {
  const [layers, setLayers] = useState<Game[]>([]);
  useEffect(() => {
    setLayers((l) =>
      !game ? [] : l[l.length - 1]?.appid === game.appid ? l : [...l.slice(-1), game],
    );
  }, [game]);
  return (
    <>
      {layers.map((g) => (
        <Img key={g.appid} className="vh-hero" srcs={heroUrls(g)} />
      ))}
    </>
  );
}

declare const SteamUIStore: any;
const isRunning = (g: Game) =>
  safe(() => SteamUIStore.RunningApps.some((a: any) => a.appid === g.appid), false);

// Remembered while Steam runs: coming back from a game page lands on the same shelf and cover.
let lastShelf: ShelfId = "installed";
const lastFocus: Partial<Record<ShelfId, number>> = {};

export function Home() {
  const shelves = activeShelves(useSettings().shelves);
  const [shelf, setShelf] = useState<ShelfId>(() =>
    shelves.some((s) => s.id === lastShelf) ? lastShelf : shelves[0].id,
  );
  const [games, setGames] = useState<Game[]>(() => loadShelf(shelf));
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
  const meta = focused
    ? [
        focused.platform,
        hours(focused.minutes),
        since(focused.lastPlayed),
      ].filter(Boolean)
    : [];

  return (
    <Focusable className="vh-root" flow-children="column" onButtonDown={onButtonDown}>
      <style>{homeCss}</style>
      <Friends />

      <div className="vh-stage" aria-hidden="true">
        <Hero game={focused} />
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

      <Focusable className="vh-row" flow-children="row">
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
              ((e?.currentTarget ?? e?.target) as HTMLElement | null)?.scrollIntoView?.({
                behavior: "smooth",
                inline: "center",
                block: "nearest",
              });
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
          onGamepadFocus={() => {
            setFocusedId(null);
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
