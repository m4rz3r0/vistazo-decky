import { DialogButton, Focusable, ModalRoot, showModal } from "@decky/ui";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { medal } from "./data";
import { num, t } from "./i18n";
import { isUnloaded } from "./lifecycle";
import { GameState, cancelOwn, gameState, retryOwn } from "./own";
import { Ring, fitPanel, formatSize, markPage } from "./Panel";
import { wordInSpanish } from "./retroText";
import { Progress, RommGame, rommGame, rommProgress } from "./romm";
import { pageCss } from "./styles";

// The page of a RomM game that is Vistazo's own entry in Steam. Steam's play button stays (it
// starts the entry as any other); under it goes the same first screen every game gets: the
// achievements and what comes next on the left, the game on the right. Everything on it comes
// straight from RomM with Vistazo's key. While the game's file is not on the Deck, a row above
// says so and brings it.
declare const SteamClient: any;

interface Loaded {
  game: RommGame;
  progress: Progress | null;
}
// What RomM said of each game, kept while Steam runs: the page shows it at once and reads again.
const seen = new Map<number, Loaded>();

const badge = (u: string) => (/^https:\/\/media\.retroachievements\.org\/[\w/.-]+$/.test(u) ? u : "");

function useGame(romId: number, appid: number): Loaded | null | undefined {
  // undefined: asking; null: RomM did not answer.
  const [data, setData] = useState<Loaded | null | undefined>(seen.get(romId));
  useEffect(() => {
    let alive = true;
    const read = async (refresh: boolean) => {
      const game = await rommGame(romId).catch(() => null);
      if (!alive || isUnloaded()) return;
      if (!game?.ok) {
        if (!seen.has(romId)) setData(null);
        return;
      }
      const before = seen.get(romId)?.progress ?? null;
      const now: Loaded = { game, progress: before };
      seen.set(romId, now);
      setData(now);
      if (!game.ra_id) return;
      const progress = await rommProgress(game.ra_id, refresh).catch(() => null);
      if (!alive || isUnloaded() || !progress?.ok) return;
      const next = { game, progress };
      seen.set(romId, next);
      setData(next);
    };
    read(false);
    // When the game closes RomM reads its achievements again and the page shows them.
    const reg = SteamClient.GameSessions.RegisterForAppLifetimeNotifications((u: any) => {
      if (u && u.bRunning === false && Number(u.unAppID) === appid) read(true);
    });
    return () => {
      alive = false;
      reg?.unregister?.();
    };
  }, [romId, appid]);
  return data;
}

// Whether the game's file is here and how a download goes, asked again while one is under way.
function useFile(appid: number): [GameState | null, () => void] {
  const [state, setState] = useState<GameState | null>(null);
  const [tick, setTick] = useState(0);
  const downloading = state?.job?.state === "downloading";
  useEffect(() => {
    let alive = true;
    const read = () => gameState(appid).then((s) => alive && setState(s)).catch(() => undefined);
    read();
    const timer = downloading ? setInterval(read, 700) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [appid, tick, downloading]);
  return [state, () => setTick((n) => n + 1)];
}

export const OwnPage = memo(function OwnPage({ appid, romId }: { appid: number; romId: number }) {
  const data = useGame(romId, appid);
  const [file, again] = useFile(appid);
  const root = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    markPage(el, true);
    setClipped(fitPanel(el, openRef.current));
  }, [data, file?.installed, file?.job?.state, open]);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const page = el.closest("[data-vz-page]") as HTMLElement | null;
    const ro = new ResizeObserver(() => setClipped(fitPanel(el, openRef.current)));
    if (page) ro.observe(page);
    return () => {
      ro.disconnect();
      markPage(el, false);
    };
  }, []);

  const game = data?.game;
  const list = game?.achievements ?? [];
  const got = new Set(data?.progress?.ids ?? []);
  const total = data?.progress?.total || list.length;
  const earned = data?.progress?.ok ? Number(data.progress.earned) || 0 : 0;
  const hardcore = Number(data?.progress?.hardcore) || 0;
  // The ones most players have come first: they are the nearest.
  const next = list
    .filter((a) => !got.has(a.badge_id))
    .sort((a, b) => b.num_awarded - a.num_awarded)
    .slice(0, 3);

  const cells: [string, string][] = [];
  if (game?.platform) cells.push([t.retroPlatform, game.platform]);
  if (game?.released) cells.push([t.year, String(new Date(game.released).getUTCFullYear())]);
  if (game?.genres.length) cells.push([t.genre, game.genres.slice(0, 2).map(wordInSpanish).join(", ")]);
  const size = formatSize(game?.size ?? 0);
  if (size) cells.push([t.onDisk, size]);
  if (game && game.rating > 0) cells.push([t.retroRating, `${num(Math.round(game.rating))} %`]);

  const job = file?.job?.state;
  const downloading = job === "downloading";
  const failed = !!job && !["downloading", "installed", "cancelled"].includes(job);
  const share = file?.job?.total ? Math.floor((100 * file.job.done) / file.job.total) : 0;

  return (
    <div className={`vz-root${open ? " vz-reading" : ""}`} ref={root}>
      <style>{pageCss() + OWN_CSS}</style>
      {file && !file.installed && (
        <Focusable className="vz-own-bar" flow-children="row">
          <DialogButton
            className="vz-own-get"
            onClick={() => (downloading ? cancelOwn(appid) : retryOwn(appid)).then(again)}
          >
            {downloading ? t.ownCancel : t.ownGet}
          </DialogButton>
          <span className={`vz-own-note${failed ? " vz-own-bad" : ""}`}>
            {downloading ? t.ownDownloading(share) : failed ? t.ownWhy(job) : t.ownNotHere}
          </span>
        </Focusable>
      )}
      <Focusable className={`vz-cols${total > 0 ? "" : " vz-solo"}`} flow-children="row">
        {total > 0 && game && (
          <Focusable
            className={`vz-ach vz-${medal(earned, total) ?? "none"}`}
            noFocusRing
            onActivate={() => showModal(<Achievements name={game.name} list={list} got={got} />)}
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
                  <li className="vz-next-item" key={a.badge_id}>
                    {badge(a.badge_url_lock || a.badge_url) ? (
                      <img className="vz-icon" src={badge(a.badge_url_lock || a.badge_url)} alt="" />
                    ) : (
                      <span className="vz-icon" />
                    )}
                    <span className="vz-next-name">{a.title}</span>
                    <span className="vz-next-sub">{a.num_awarded > 0 ? t.retroPlayers(num(a.num_awarded)) : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Focusable>
        )}
        <div className="vz-about">
          {data === undefined && <div className="vz-ach-quiet">{t.ownAsking}</div>}
          {data === null && <div className="vz-ach-quiet">{t.ownNoAnswer}</div>}
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
    </div>
  );
});

// Every achievement of the game: the earned ones first, then the rest from the most common.
function Achievements({
  name,
  list,
  got,
  closeModal,
}: {
  name: string;
  list: RommGame["achievements"];
  got: Set<string>;
  closeModal?: () => void;
}) {
  const rows = [...list].sort(
    (a, b) => Number(got.has(b.badge_id)) - Number(got.has(a.badge_id)) || b.num_awarded - a.num_awarded,
  );
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
        {rows.map((a) => {
          const mine = got.has(a.badge_id);
          const img = badge(mine ? a.badge_url : a.badge_url_lock || a.badge_url);
          return (
            <Focusable
              key={a.badge_id}
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
              <i>{a.num_awarded > 0 ? t.retroPlayers(num(a.num_awarded)) : ""}</i>
              <em>{num(a.points)}</em>
            </Focusable>
          );
        })}
      </Focusable>
    </ModalRoot>
  );
}

const OWN_CSS = `
.vz-own-bar { display: flex; align-items: center; gap: 16px; margin: 0 0 18px; }
.vz-own-bar .vz-own-get.DialogButton { width: auto; min-width: 190px; flex: none; }
.vz-own-note { font-size: 14px; color: rgba(255, 255, 255, 0.6); }
.vz-own-note.vz-own-bad { color: var(--obs-warn, #ffb040); }
.vz-own-title {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  margin: 0 0 14px; font-size: 22px; font-weight: 700; color: #f4f4f4;
}
.vz-own-title span { font-size: 15px; font-weight: 600; color: rgba(255, 255, 255, 0.55); font-variant-numeric: tabular-nums; }
.vz-own-list { display: flex; flex-direction: column; gap: 6px; max-height: 62vh; overflow-y: auto; padding: 3px; }
.vz-own-list::-webkit-scrollbar { display: none; }
.vz-own-row {
  display: grid; grid-template-columns: 48px minmax(0, 1fr) auto 44px; align-items: center; gap: 14px;
  padding: 8px 10px; border-radius: 12px; outline: 1.5px solid transparent; outline-offset: -1.5px;
}
.vz-own-row.gpfocus { outline-color: var(--obs-ring, #b8f35a); }
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
