import { Focusable, ModalRoot, appActionButtonClasses, showModal } from "@decky/ui";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Addon, AddonAchievement, AddonFile, AddonGame, useAddons } from "./addons";
import { medal } from "./data";
import { num, t } from "./i18n";
import { isUnloaded } from "./lifecycle";
import { ACTIONS_CSS, Actions, Ring, fitPanel, formatSize, markPage, pageOf, useActions } from "./Panel";
import { safe } from "./safe";
import { wordInSpanish } from "./retroText";
import { pageCss } from "./styles";

// The page of a game that is an add-on's own entry in Steam (a RomM game, say). Steam's play
// button stays (it starts the entry as any other); under it goes the same first screen every game
// gets: the achievements and what comes next on the left, the game on the right. Everything on
// it is what the add-on hands over; Vistazo only draws it. While the game's file is not on the
// Deck, the button that brings it takes the play button's place.
declare const SteamClient: any;
declare const appStore: any;

// What each add-on said of each game, kept while Steam runs: the page shows it at once and asks
// again.
const seen = new Map<number, AddonGame>();
// Games closed since their page last asked: the add-on is asked to read them afresh.
const played = new Set<number>();
export function watchAddonGames(owned: (appid: number) => boolean): () => void {
  const reg = safe(
    () =>
      SteamClient.GameSessions.RegisterForAppLifetimeNotifications((u: any) => {
        const appid = Number(u?.unAppID);
        if (u && u.bRunning === false && owned(appid)) played.add(appid);
      }),
    null as any,
  );
  return () => safe(() => reg?.unregister(), undefined);
}

const badge = (u: string) => (/^https:\/\/media\.retroachievements\.org\/[\w/.-]+$/.test(u) ? u : "");

function useGame(addon: Addon, appid: number): AddonGame | null | undefined {
  // undefined: asking; null: the add-on has nothing (its source did not answer).
  const [data, setData] = useState<AddonGame | null | undefined>(seen.get(appid));
  const round = useAddons();
  useEffect(() => {
    let alive = true;
    const read = async (refresh: boolean) => {
      const game = await Promise.resolve(addon.game?.(appid, refresh)).catch(() => null);
      if (!alive || isUnloaded()) return;
      if (!game) {
        if (!seen.has(appid)) setData(null);
        return;
      }
      seen.set(appid, game);
      setData(game);
    };
    // What there is first; then, after a game, afresh (that may take a while).
    read(false).then(() => {
      if (alive && played.delete(appid)) read(true);
    });
    return () => {
      alive = false;
    };
  }, [addon, appid, round]);
  return data;
}

// Whether the game's file is here and how a download goes, asked again while one is under way.
function useFile(addon: Addon, appid: number): [AddonFile | null, () => void] {
  const [state, setState] = useState<AddonFile | null>(null);
  const [tick, setTick] = useState(0);
  const downloading = !!state?.downloading;
  useEffect(() => {
    if (!addon.file) return;
    let alive = true;
    const read = () =>
      Promise.resolve(addon.file!(appid))
        .then((s) => alive && setState(s))
        .catch(() => undefined);
    read();
    // Often while a download runs; now and then otherwise (one may be started elsewhere).
    const timer = setInterval(read, downloading ? 700 : 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [addon, appid, tick, downloading]);
  return [state, () => setTick((n) => n + 1)];
}

export const AddonPage = memo(function AddonPage({ appid, addon }: { appid: number; addon: Addon }) {
  const game = useGame(addon, appid);
  const [file, again] = useFile(addon, appid);
  // What add-ons offer to do with this game (uninstall it, say), as on a Steam game's page.
  const actions = useActions(appid, `${file?.here}`);
  const root = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  // Without its file the game cannot start: Steam's play button steps aside and the button that
  // brings the file takes its place, and the selection.
  const bar = useRef<HTMLDivElement>(null);
  const missing = !!file && !file.here;
  useLayoutEffect(() => {
    const el = bar.current;
    const play = (root.current ? pageOf(root.current) : null)?.querySelector(`.${playClass}`) as HTMLElement | null;
    if (!missing || !el || !play) return;
    play.style.visibility = "hidden";
    el.style.marginTop = "0px";
    el.style.marginTop = `${play.getBoundingClientRect().top - el.getBoundingClientRect().top}px`;
    el.style.height = `${play.offsetHeight}px`;
    el.style.setProperty("--vz-play-width", `${play.offsetWidth}px`);
    (el.querySelector(".vz-own-get") as HTMLElement | null)?.focus();
    return () => {
      play.style.removeProperty("visibility");
      // The file is here now: the selection goes to the play button that came back.
      setTimeout(() => {
        if (play.isConnected) ((play.querySelector(".Focusable") as HTMLElement | null) ?? play).focus();
      }, 0);
    };
  }, [missing]);

  // The row at the foot of the screen takes its room from the columns above it.
  const reserve = () => ((root.current?.querySelector(".vz-acts-end") as HTMLElement | null)?.offsetHeight ?? 0);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    markPage(el, true);
    setClipped(fitPanel(el, openRef.current, reserve()));
  }, [game, file?.here, file?.downloading, file?.problem, open, actions.length]);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const page = el.closest("[data-vz-page]") as HTMLElement | null;
    const ro = new ResizeObserver(() => setClipped(fitPanel(el, openRef.current, reserve())));
    if (page) ro.observe(page);
    return () => {
      ro.disconnect();
      markPage(el, false);
    };
  }, []);

  const name = String(safe(() => appStore.GetAppOverviewByAppID(appid)?.display_name, "") ?? "");
  const ach = game?.achievements;
  const list = ach?.list ?? [];
  const got = new Set(ach?.got ?? []);
  const total = ach?.total || list.length;
  const earned = ach?.earned ?? 0;
  const hardcore = ach?.hardcore ?? 0;
  // The ones most players have come first: they are the nearest.
  const next = list
    .filter((a) => !got.has(a.id))
    .sort((a, b) => b.players - a.players)
    .slice(0, 3);

  const cells: [string, string][] = [];
  if (game?.platform) cells.push([t.retroPlatform, game.platform]);
  if (game?.year) cells.push([t.year, String(game.year)]);
  if (game?.genres?.length) cells.push([t.genre, game.genres.slice(0, 2).map(wordInSpanish).join(", ")]);
  const size = formatSize(game?.size ?? 0);
  if (size) cells.push([missing ? t.ownSize : t.onDisk, size]);
  if (game?.rating && game.rating > 0) cells.push([t.retroRating, `${num(Math.round(game.rating))} %`]);

  const downloading = !!file?.downloading;
  const failed = !!file?.problem;
  const share = file?.share ?? 0;

  return (
    <div className={`vz-root${open ? " vz-reading" : ""}`} ref={root} style={{ display: "flex", flexDirection: "column" }}>
      <style>{pageCss() + OWN_CSS + ACTIONS_CSS}</style>
      {missing && (
        <Focusable className="vz-own-bar" flow-children="row" ref={bar as any}>
          <Focusable
            className={`vz-own-get${downloading ? " vz-own-stop" : ""}`}
            noFocusRing
            onActivate={() =>
              Promise.resolve(downloading ? addon.cancelFile?.(appid) : addon.fetchFile?.(appid))
                .catch(() => undefined)
                .then(again)
            }
          >
            {downloading ? t.ownCancel : t.ownGet}
          </Focusable>
          <span className={`vz-own-note${failed ? " vz-own-bad" : ""}`}>
            {downloading ? t.ownDownloading(share) : failed ? file?.problem : t.ownNotHere}
          </span>
        </Focusable>
      )}
      <Focusable className={`vz-cols${total > 0 ? "" : " vz-solo"}`} flow-children="row">
        {total > 0 && game && (
          <Focusable
            className={`vz-ach vz-${medal(earned, total) ?? "none"}`}
            noFocusRing
            onActivate={() => showModal(<Achievements name={name} list={list} got={got} />)}
            onOKActionDescription={t.seeAllAchievements}
          >
            <div className="vz-ach-head">
              <Ring share={(earned / total) * 100} />
              <div className="vz-ach-sum">
                <div className="vz-ach-count">
                  <span className="vz-ach-n">{earned}</span>
                  <span className="vz-ach-of">/{total}</span>
                </div>
                <div className="vz-ach-label">
                  {earned >= total ? t.platinum : t.achievements}
                  {hardcore > 0 ? ` · ${t.retroHardcore(hardcore)}` : ""}
                </div>
              </div>
            </div>
            {next.length > 0 && (
              <ul className="vz-next">
                <li className="vz-next-cap">
                  <span>{t.upNext}</span>
                  <span>{t.retroHave}</span>
                </li>
                {next.map((a) => (
                  <li className="vz-next-item" key={a.id}>
                    {badge(a.badgeLocked || a.badge) ? (
                      <img className="vz-icon" src={badge(a.badgeLocked || a.badge)} alt="" />
                    ) : (
                      <span className="vz-icon" />
                    )}
                    <span className="vz-next-name">{a.title}</span>
                    <span className="vz-next-sub">{a.players > 0 ? t.retroPlayers(num(a.players)) : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Focusable>
        )}
        <div className="vz-about">
          {game === undefined && <div className="vz-ach-quiet">{t.ownAsking}</div>}
          {game === null && <div className="vz-ach-quiet">{t.ownNoAnswer(addon.name)}</div>}
          {game?.stale && <div className="vz-own-kept">{t.ownKept(addon.name)}</div>}
          <div className="vz-facts">
            {cells.map(([label, value]) => (
              <div className="vz-fact" key={label}>
                <span className="vz-fact-label">{label}</span>
                <span className="vz-fact-value">{value}</span>
              </div>
            ))}
          </div>
          {game?.summary &&
            (clipped || open ? (
              <Focusable
                className="vz-desc-box"
                noFocusRing
                onActivate={() => setOpen((o) => !o)}
                onOKActionDescription={open ? t.readLess : t.readAll}
              >
                <p className={`vz-desc${open ? " vz-open" : ""}`}>{game.summary}</p>
              </Focusable>
            ) : (
              <p className="vz-desc">{game.summary}</p>
            ))}
        </div>
      </Focusable>
      {!missing && <Actions actions={actions} end />}
    </div>
  );
});

// Every achievement of the game: the earned ones first, in the game's order, then the rest from
// the one most players have (the nearest).
function Achievements({
  name,
  list,
  got,
  closeModal,
}: {
  name: string;
  list: AddonAchievement[];
  got: Set<string>;
  closeModal?: () => void;
}) {
  const rows = [...list].sort((a, b) => {
    const [mine, theirs] = [got.has(a.id), got.has(b.id)];
    if (mine !== theirs) return mine ? -1 : 1;
    return mine ? a.order - b.order : b.players - a.players;
  });
  return (
    <ModalRoot closeModal={closeModal} bAllowFullSize>
      <style>{OWN_CSS}</style>
      <div className="vz-own-title">
        {name}
        <span>
          {num(got.size)} / {num(list.length)}
        </span>
      </div>
      <Focusable className="vz-own-list">
        {rows.map((a, i) => {
          const mine = got.has(a.id);
          const img = badge(mine ? a.badge : a.badgeLocked || a.badge);
          // Each of the two groups under its name.
          const cap = i === 0 || mine !== got.has(rows[i - 1].id);
          return [
            cap && (
              <div className="vz-own-cap" key={mine ? "earned" : "locked"}>
                {mine ? t.retroFilter.earned : t.retroFilter.locked}
              </div>
            ),
            <Focusable
              key={a.id}
              className={`vz-own-row${mine ? " vz-own-mine" : ""}`}
              noFocusRing
              onActivate={() => undefined}
              onGamepadFocus={(e: any) => e?.currentTarget?.scrollIntoView?.({ block: "nearest" })}
            >
              {img ? <img src={img} alt="" /> : <span className="vz-own-noimg" />}
              <div>
                <b>{a.title}</b>
                <p>{a.description}</p>
              </div>
              <i>{a.players > 0 ? t.retroPlayers(num(a.players)) : ""}</i>
              <em>{num(a.points)}</em>
            </Focusable>,
          ];
        })}
      </Focusable>
    </ModalRoot>
  );
}

const playClass = (appActionButtonClasses as Record<string, string>).PlayButtonContainer;

const OWN_CSS = `
.vz-own-bar { position: relative; z-index: 1; display: flex; align-items: center; gap: 18px; margin: 0 0 22px; }
.vz-own-get {
  display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  width: var(--vz-play-width, 214px); height: 100%; min-height: 48px; flex: none; border-radius: 14px;
  background: var(--obs-accent, var(--vz-accent, #b8f35a)); color: var(--obs-on-accent, #0b0b0b);
  font-size: 16px; font-weight: 700; outline: 1.5px solid transparent; outline-offset: 3px;
}
.vz-own-get.vz-own-stop { background: rgba(255, 255, 255, 0.08); color: #f4f4f4; }
.vz-own-get.gpfocus { outline: 1.5px solid var(--obs-ring, var(--vz-accent, #b8f35a)); outline-offset: 3px; }
.vz-own-kept { margin: 0 0 12px; font-size: 13px; color: rgba(255, 255, 255, 0.5); }
.vz-own-note { font-size: 14px; color: rgba(255, 255, 255, 0.6); }
.vz-own-note.vz-own-bad { color: var(--obs-warn, #ffb040); }
.vz-own-title {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  margin: 0 0 14px; font-size: 22px; font-weight: 700; color: #f4f4f4;
}
.vz-own-title span { font-size: 15px; font-weight: 600; color: rgba(255, 255, 255, 0.55); font-variant-numeric: tabular-nums; }
.vz-own-list { display: flex; flex-direction: column; gap: 6px; max-height: 63vh; overflow-y: auto; padding: 3px; }
.vz-own-list::-webkit-scrollbar { display: none; }
.vz-own-cap { margin: 10px 10px 2px; font-size: 14px; font-weight: 600; color: rgba(255, 255, 255, 0.55); }
.vz-own-cap:first-child { margin-top: 0; }
.vz-own-row {
  display: grid; grid-template-columns: 48px minmax(0, 1fr) auto 44px; align-items: center; gap: 14px;
  padding: 8px 10px; border-radius: 12px; outline: 1.5px solid transparent; outline-offset: -1.5px;
}
.vz-own-row.vz-own-row.gpfocus { outline: 1.5px solid var(--obs-ring, #b8f35a); outline-offset: -1.5px; }
.vz-own-row img, .vz-own-noimg { width: 48px; height: 48px; border-radius: 8px; display: block; }
.vz-own-row:not(.vz-own-mine) img { opacity: 0.55; }
.vz-own-row b { display: block; font-size: 15px; font-weight: 600; color: rgba(255, 255, 255, 0.7); }
.vz-own-row.vz-own-mine b { color: #f4f4f4; }
.vz-own-row p { margin: 2px 0 0; font-size: 13px; line-height: 18px; color: rgba(255, 255, 255, 0.55); }
.vz-own-row i { font-style: normal; font-size: 12px; color: rgba(255, 255, 255, 0.45); white-space: nowrap; }
.vz-own-row em {
  font-style: normal; text-align: right; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.55);
}
.vz-own-row.vz-own-mine em { color: var(--obs-reward, #f5cf5a); }
`;
