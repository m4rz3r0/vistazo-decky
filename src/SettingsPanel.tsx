import { t } from "./i18n";
import { ButtonItem, ConfirmModal, DropdownItem, PanelSection, PanelSectionRow, TextField, ToggleField, showModal } from "@decky/ui";
import { useState } from "react";
import { PairResult, pairRomm, unlinkRomm, useRomm } from "./romm";
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
        {s.retro && <RommRow />}
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

// Vistazo's own RomM key, to see a retro game's achievements as soon as it closes. One row: what
// state it is in and the one thing to do about it.
let lastResult: PairResult | null = null;
function RommRow() {
  const status = useRomm();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PairResult | null>(lastResult);
  if (!status || status === "no-server") return null;
  const linked = status === "linked";
  const note = result && result !== "ok" ? t.rommResult[result] : undefined;
  const description = note ?? (linked ? t.rommLinked : status === "moved" ? t.rommMoved : t.rommUnlinked);
  const connect = (code: string) => {
    setBusy(true);
    pairRomm(code).then((r) => {
      lastResult = r;
      setResult(r);
      setBusy(false);
    });
  };
  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        label={t.rommLabel}
        description={description}
        disabled={busy}
        onClick={() => {
          lastResult = null;
          setResult(null);
          if (linked) unlinkRomm();
          else showModal(<PairModal onCode={connect} />);
        }}
      >
        {linked ? t.rommUnlink : t.rommPair}
      </ButtonItem>
    </PanelSectionRow>
  );
}

// Where RomM's pairing code is typed: 8 letters and numbers, dashes and spaces ignored.
function PairModal({ onCode, closeModal }: { onCode: (code: string) => void; closeModal?: () => void }) {
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (
    <ConfirmModal
      strTitle={t.rommPair}
      strDescription={t.rommPairSteps}
      strOKButtonText={t.rommPair}
      bOKDisabled={clean.length !== 8}
      closeModal={closeModal}
      onOK={() => onCode(clean)}
    >
      <TextField
        label={t.rommCode}
        value={code}
        focusOnMount
        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))}
      />
    </ConfirmModal>
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
