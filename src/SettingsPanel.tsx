import { t } from "./i18n";
import { ButtonItem, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { Settings, setSetting, useSettings } from "./settings";
import { playSample } from "./sounds";

// Vistazo's settings, in the quick access menu. Plain words, one line of context each.
export function SettingsPanel() {
  const s = useSettings();
  const toggle = (key: keyof Settings, label: string, description: string, disabled = false) => (
    <PanelSectionRow>
      <ToggleField
        label={label}
        description={description}
        checked={s[key]}
        disabled={disabled}
        onChange={(v) => setSetting(key, v)}
      />
    </PanelSectionRow>
  );
  return (
    <>
      <PanelSection title={t.screens}>
        {toggle("home", t.homeLabel, t.homeDesc)}
        {toggle("page", t.pageLabel, t.pageDesc)}
        {toggle("protondb", t.protonLabel, t.protonDesc, !s.page)}
      </PanelSection>
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
