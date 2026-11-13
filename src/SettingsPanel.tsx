import { t } from "./i18n";
import { ButtonItem, DropdownItem, Field, Focusable, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { useState } from "react";
import { OfferState, installAddon, readAddonList, useAddonList } from "./addonList";
import { allAddons, useAddons } from "./addons";
import { Guard } from "./Guard";
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
  id === "installed" ? t.installedDesc : id === "retro" ? t.retroDesc : id.startsWith("addon:") ? t.addonShelfDesc : t.collectionDesc;

export function SettingsPanel() {
  const s = useSettings();
  useAddons(); // their shelves come and go
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
  const home = (
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
    </>
  );
  const page = (
    <PanelSection title={t.pageSection}>
      {toggle("page", t.pageLabel, t.pageDesc)}
      {toggle("protondb", t.protonLabel, t.protonDesc, s.page ? undefined : t.needsPage)}
      {toggle("retro", t.retroPageLabel, t.retroPageDesc)}
    </PanelSection>
  );
  const look = (
    <>
      <ThemeSection />
      <PanelSection title={t.sound}>
        {toggle("sounds", t.soundsLabel, t.soundsDesc)}
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={playSample}>
            {t.playSample}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );

  // The settings are a short menu of groups, each opening its own few settings: nothing to scroll
  // through to find one. Each row says in a few words how that group stands now.
  const [group, setGroup] = useState<string | null>(lastGroup);
  const open = (g: string | null) => {
    lastGroup = g;
    setGroup(g);
  };
  const addons = allAddons().filter((a) => a.Settings);
  const addon = group?.startsWith("addon:") ? addons.find((a) => `addon:${a.id}` === group) : undefined;
  const AddonRows = addon?.Settings;
  const body =
    group === "home" ? home : group === "page" ? page : group === "look" ? look : group === "addons" ? <AddonList /> : addon && AddonRows ? (
      <Guard name={`add-on ${addon.id}`}>
        <AddonRows />
      </Guard>
    ) : null;
  if (body)
    return (
      <Focusable onCancelButton={() => open(null)}>
        <PanelSection>
          <PanelSectionRow>
            <Field focusable highlightOnFocus onActivate={() => open(null)} onClick={() => open(null)} label={`‹  ${t.settingsBack}`} bottomSeparator="none" />
          </PanelSectionRow>
        </PanelSection>
        {body}
      </Focusable>
    );
  const shelvesOn = availableShelves().filter((x) => s.shelves.includes(x.id)).length;
  const pageBits = [s.page && t.pageLabel, s.page && s.protondb && "ProtonDB", s.retro && t.retro].filter(Boolean).join(" · ");
  const row = (g: string, label: string, summary: string) => (
    <PanelSectionRow key={g}>
      <Field
        focusable
        highlightOnFocus
        onActivate={() => open(g)}
        onClick={() => open(g)}
        label={label}
        description={summary || undefined}
        bottomSeparator="none"
      >
        <span style={{ opacity: 0.5 }}>›</span>
      </Field>
    </PanelSectionRow>
  );
  return (
    <>
      <PanelSection>
        {row("home", t.homeSection, s.home ? t.shelvesCount(shelvesOn) : t.off)}
        {row("page", t.pageSection, pageBits || t.off)}
        {row("look", t.lookSection, s.sounds ? t.soundsLabel : "")}
        {addons.map((a) => row(`addon:${a.id}`, a.name, t.addonRow))}
        {row("addons", t.addonsSection, t.addonsCount(addons.length))}
      </PanelSection>
      <PanelSection title={t.updateSection}>
        <UpdateRows />
        {toggle("updates", t.updatesLabel, t.updatesDesc)}
      </PanelSection>
    </>
  );
}

// The group that was open stays open while Steam runs (coming back from a dialog, say).
let lastGroup: string | null = null;

// The add-ons there are, each with what it is for and one button: install it, or bring it up to
// date. Decky does the installing and asks first; taking one away is done from Decky's own list.
function AddonList() {
  const { offers, failed } = useAddonList();
  if (!offers.length)
    return failed ? (
      <PanelSection title={t.addonsSection}>
        <PanelSectionRow>
          <ButtonItem layout="below" description={t.addonsFailed} onClick={() => readAddonList(true)}>
            {t.updateCheck}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    ) : null;
  return (
    <PanelSection title={t.addonsSection}>
      {offers.map((o) => (
        <AddonRow key={o.id} offer={o} />
      ))}
    </PanelSection>
  );
}
function AddonRow({ offer }: { offer: OfferState }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const note = offer.tooNew ? t.addonTooNew : said ?? (offer.installed ? `${offer.about} ${t.addonInstalled(offer.installed)}` : offer.about);
  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        label={offer.name}
        description={note}
        disabled={busy || offer.tooNew}
        onClick={() => {
          setBusy(true);
          setSaid(null);
          installAddon(offer).then((r) => {
            setSaid(r === "none" ? t.upToDate : r === "failed" ? t.updateFailed : null);
            setBusy(false);
          });
        }}
      >
        {offer.installed ? t.updateCheck : t.addonInstall}
      </ButtonItem>
    </PanelSectionRow>
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
