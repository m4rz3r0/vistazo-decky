import { t } from "./i18n";
import { ButtonItem, DropdownItem, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { Settings, setSetting, useSettings } from "./settings";
import { playSample } from "./sounds";
import { availableShelves } from "./home/data";
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
    </>
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
