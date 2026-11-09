import { t } from "./i18n";
import { ButtonItem, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { Settings, setSetting, useSettings } from "./settings";
import { playSample } from "./sounds";

// Vistazo's settings, in the quick access menu. A short name per option; the README explains each one.
export function SettingsPanel() {
  const s = useSettings();
  const toggle = (key: keyof Settings, label: string, disabled = false) => (
    <PanelSectionRow>
      <ToggleField
        label={label}
        checked={s[key]}
        disabled={disabled}
        onChange={(v) => setSetting(key, v)}
      />
    </PanelSectionRow>
  );
  return (
    <>
      <PanelSection title={t.homeSection}>
        {toggle("home", t.homeLabel)}
        {toggle("aOpensPage", t.aOpensPageLabel, !s.home)}
      </PanelSection>
      <PanelSection title={t.pageSection}>
        {toggle("page", t.pageLabel)}
        {toggle("protondb", t.protonLabel, !s.page)}
      </PanelSection>
      <PanelSection title={t.sound}>
        {toggle("sounds", t.soundsLabel)}
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={playSample}>
            {t.playSample}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}
