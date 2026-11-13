import { t } from "./i18n";
import { ButtonItem, ConfirmModal, DropdownItem, PanelSection, PanelSectionRow, TextField, ToggleField, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import { GameState, addOwn, gameState, loadOwned, ownedApp, ownedRom, removeOwn, retryOwn } from "./own";
import { openPage } from "./retro";
import { PairAnswer, RommHealth, checkRomm, pairRomm, unlinkRomm, useRomm } from "./romm";
import { Settings, setSetting, useSettings } from "./settings";
import { playSample } from "./sounds";
import { availableShelves } from "./home/data";
import { checkForUpdate, installUpdate, useUpdate } from "./update";
import { COLOR, COLORS, MOTION, TEXT, setThemeEnabled, setThemeOption, useTheme } from "./theme";

// Vistazo's settings, in the quick access menu. Following the Apple, Android and Windows guidelines:
// short labels that name what you get, never repeating the section title; one line that says what
// happens when the switch is on; a setting that depends on another says what it needs.
type Flag = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const shelfDesc = (id: string) =>
  id === "installed" ? t.installedDesc : id === "retro" ? t.retroDesc : t.collectionDesc;

export function SettingsPanel() {
  const s = useSettings();
  // A setting that depends on another says why it is off instead of its usual line.
  const toggle = (key: Flag, label: string, description: string, blockedBy?: string) => (
    <PanelSectionRow>
      <ToggleField
        label={label}
        description={blockedBy ?? description}
        checked={s[key]}
        disabled={!!blockedBy}
        onChange={(v) => setSetting(key, v)}
      />
    </PanelSectionRow>
  );
  return (
    <>
      <PanelSection title={t.homeSection}>
        {toggle("home", t.homeLabel, t.homeDesc)}
        {toggle("aOpensPage", t.aOpensPageLabel, t.aOpensPageDesc, s.home ? undefined : t.needsHome)}
      </PanelSection>
      <PanelSection title={t.shelvesSection}>
        {availableShelves().map((shelf) => {
          const on = s.shelves.includes(shelf.id);
          // The last shelf on stays on: the home always has one to show.
          const blockedBy = !s.home ? t.needsHome : on && s.shelves.length <= 1 ? t.lastShelf : undefined;
          return (
            <PanelSectionRow key={shelf.id}>
              <ToggleField
                label={shelf.label}
                description={blockedBy ?? shelfDesc(shelf.id)}
                checked={on}
                disabled={!!blockedBy}
                onChange={(v) =>
                  setSetting(
                    "shelves",
                    v ? [...s.shelves, shelf.id] : s.shelves.filter((id) => id !== shelf.id),
                  )
                }
              />
            </PanelSectionRow>
          );
        })}
      </PanelSection>
      <PanelSection title={t.pageSection}>
        {toggle("page", t.pageLabel, t.pageDesc)}
        {toggle("protondb", t.protonLabel, t.protonDesc, s.page ? undefined : t.needsPage)}
        {toggle("retro", t.retroPageLabel, t.retroPageDesc)}
        {toggle("ownGames", t.ownGamesLabel, t.ownGamesDesc, s.retro ? undefined : t.needsRetro)}
        {s.retro && <RommRow games={s.ownGames} />}
        {s.retro && s.ownGames && <OwnRow />}
      </PanelSection>
      <ThemeSection />
      <PanelSection title={t.sound}>
        {toggle("sounds", t.soundsLabel, t.soundsDesc)}
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={playSample}>
            {t.playSample}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title={t.updateSection}>
        <UpdateRows />
        {toggle("updates", t.updatesLabel, t.updatesDesc)}
      </PanelSection>
    </>
  );
}

// Vistazo's own RomM key, to see a retro game's achievements as soon as it closes and, with
// `games`, to look after the games themselves. One row: what state it is in and the one thing to
// do about it. A key for achievements only is enough until the games are Vistazo's: then the row
// asks to connect again, with a key that can see them. Opening the settings asks RomM whether the
// key still works, so the row never says "connected" about a key RomM has dropped.
function RommRow({ games }: { games: boolean }) {
  const status = useRomm();
  const [health, setHealth] = useState<RommHealth | null>(null);
  const has = status === "linked" || status === "limited";
  useEffect(() => {
    let alive = true;
    if (has) checkRomm().then((h) => alive && setHealth(h));
    else setHealth(null);
    return () => {
      alive = false;
    };
  }, [has]);
  if (!status || status === "no-server") return null;
  const short = games && status === "limited";
  const linked = has && !short;
  const description = short
    ? t.rommLimited
    : linked
      ? health === "unreachable"
        ? t.rommAsleep
        : games ? t.rommLinkedGames : t.rommLinked
      : status === "moved"
        ? t.rommMoved
        : health === "refused"
          ? t.rommDropped
          : games ? t.rommUnlinkedGames : t.rommUnlinked;
  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        label={games ? t.rommLabelGames : t.rommLabel}
        description={description}
        onClick={() => (linked ? unlinkRomm() : showModal(<PairModal games={games} />))}
      >
        {linked ? t.rommUnlink : short ? t.rommAgain : t.rommPair}
      </ButtonItem>
    </PanelSectionRow>
  );
}

// Where RomM's pairing code is typed: 8 letters and numbers, dashes and spaces ignored. It stays
// open while RomM is asked and says what came of it: connected, or exactly what is wrong (the
// code, RomM not answering, which permissions the key lacks or has too many of), ready for
// another code.
function PairModal({ games, closeModal }: { games: boolean; closeModal?: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<PairAnswer | null>(null);
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const done = answer?.result === "ok";
  const submit = () => {
    setBusy(true);
    setAnswer(null);
    pairRomm(clean, games).then((a) => {
      setAnswer(a);
      setBusy(false);
      // A code is good for one try.
      if (a.result !== "ok" && a.result !== "code") setCode("");
    });
  };
  const note = busy ? t.rommAsking : answer ? t.rommAnswer(answer, games) : "";
  return (
    <ConfirmModal
      strTitle={t.rommPair}
      strDescription={games ? t.rommPairStepsGames : t.rommPairSteps}
      strOKButtonText={done ? t.rommDone : t.rommPair}
      bOKDisabled={busy || (!done && clean.length !== 8)}
      bCancelDisabled={busy}
      bHideCloseIcon
      // The dialog closes itself on either button: it only does when there is nothing left to say.
      closeModal={() => undefined}
      onCancel={closeModal}
      onOK={() => (done ? closeModal?.() : submit())}
    >
      {!done && (
        <TextField
          label={t.rommCode}
          value={code}
          disabled={busy}
          focusOnMount
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))}
        />
      )}
      {note && (
        <div
          style={{
            marginTop: 14,
            lineHeight: 1.45,
            color: busy ? "rgba(255,255,255,0.6)" : done ? "#7fe0a8" : "var(--obs-warn, #ffb040)",
          }}
        >
          {note}
        </div>
      )}
    </ConfirmModal>
  );
}

declare const appStore: any;
// The game whose page is open, handed to Vistazo or taken back. Vistazo makes a second entry of
// its own in Steam for it (Tender keeps the one it made) and brings its file; one row says how
// that goes and holds the one thing to do next.
function OwnRow() {
  const status = useRomm();
  const [page] = useState(openPage);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    loadOwned().then(() => setReady(true));
  }, []);
  // The open page is Vistazo's own entry, or a game of Tender's that may have one.
  const romId = ownedRom(page.appid) || page.romId;
  const appid = ownedRom(page.appid) ? page.appid : ownedApp(romId);
  useEffect(() => {
    if (!ready || !appid) return setState(null);
    let alive = true;
    const read = () => gameState(appid).then((s) => alive && setState(s)).catch(() => undefined);
    read();
    const timer = setInterval(read, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [ready, appid, tick]);
  if (status !== "linked" || !ready || !romId) return null;
  const name = String(appStore.GetAppOverviewByAppID(page.appid)?.display_name ?? "");
  if (!name) return null;
  const act = (what: () => Promise<string | null>) => {
    setBusy(true);
    setWhy(null);
    what().then((w) => {
      setWhy(w);
      setBusy(false);
      setTick((n) => n + 1);
    });
  };
  const job = state?.job?.state;
  const failed = !!job && !["downloading", "installed", "cancelled"].includes(job);
  const description = why
    ? t.ownWhy(why)
    : !appid
      ? t.ownOffer
      : job === "downloading"
        ? t.ownDownloading(state?.job?.total ? Math.floor((100 * state.job.done) / state.job.total) : 0)
        : state?.installed
          ? t.ownReady
          : failed
            ? t.ownWhy(job)
            : t.ownNoFile;
  return (
    <>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          label={name}
          description={description}
          disabled={busy}
          onClick={() => (appid ? act(() => removeOwn(appid)) : act(() => addOwn(romId, t.ownName(name))))}
        >
          {appid ? t.ownRemove : t.ownAdd}
        </ButtonItem>
      </PanelSectionRow>
      {!!appid && !!state && !state.installed && job !== "downloading" && (
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy} onClick={() => act(() => retryOwn(appid).then(() => null))}>
            {t.ownDownload}
          </ButtonItem>
        </PanelSectionRow>
      )}
    </>
  );
}

// The installed version and one button: update when there is something newer, otherwise look now.
function UpdateRows() {
  const u = useUpdate();
  const status = u.checking
    ? t.updateChecking
    : u.available && u.latest
      ? t.updateFound(u.latest.version)
      : u.failed
        ? t.updateFailed
        : u.latest
          ? t.upToDate
          : undefined;
  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        label={t.versionLine(u.current)}
        description={status}
        disabled={u.checking}
        onClick={() => (u.available ? installUpdate() : checkForUpdate(true))}
      >
        {u.available && u.latest ? t.updateNow(u.latest.version) : t.updateCheck}
      </ButtonItem>
    </PanelSectionRow>
  );
}

// The Obsidiana theme, applied by CSS Loader. Its three options only show while it is on.
function ThemeSection() {
  const status = useTheme();
  if (!status) return null;
  const theme = status.loader ? status.theme : null;
  const blockedBy = !status.loader ? t.needsLoader : !theme ? t.themeMissing : undefined;
  const on = !!theme?.enabled;
  return (
    <PanelSection title={t.themeSection}>
      <PanelSectionRow>
        <ToggleField
          label={t.themeLabel}
          description={blockedBy ?? t.themeDesc}
          checked={on}
          disabled={!!blockedBy}
          onChange={setThemeEnabled}
        />
      </PanelSectionRow>
      {theme && on && (
        <>
          <PanelSectionRow>
            <DropdownItem
              label={t.colorLabel}
              description={t.colorDesc}
              rgOptions={COLORS.map((c) => ({ data: c, label: t.colorNames[c] }))}
              selectedOption={theme.color}
              onChange={(o) => setThemeOption(COLOR, o.data)}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label={t.largeTextLabel}
              description={t.largeTextDesc}
              checked={theme.largeText}
              onChange={(v) => setThemeOption(TEXT, v ? "Grande" : "Normal")}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label={t.motionLabel}
              description={t.motionDesc}
              checked={theme.motion}
              onChange={(v) => setThemeOption(MOTION, v ? "Yes" : "No")}
            />
          </PanelSectionRow>
        </>
      )}
    </PanelSection>
  );
}
