import { t } from "./i18n";
import { ButtonItem, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { setSetting, useSettings } from "./settings";
import { playSample } from "./sounds";

// Vistazo's settings, in the quick access menu. Plain words, one line of context each.
export function SettingsPanel() {
  const s = useSettings();
  return (
    <>
      <PanelSection title={t.screens}>
        <PanelSectionRow>
          <ToggleField
            label={t.homeLabel}
            description={t.homeDesc}
            checked={s.home}
            onChange={(v) => setSetting("home", v)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={t.pageLabel}
            description={t.pageDesc}
            checked={s.page}
            onChange={(v) => setSetting("page", v)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={t.protonLabel}
            description={t.protonDesc}
            checked={s.protondb}
            disabled={!s.page}
            onChange={(v) => setSetting("protondb", v)}
          />
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title={t.sound}>
        <PanelSectionRow>
          <ToggleField
            label={t.soundsLabel}
            description={t.soundsDesc}
            checked={s.sounds}
            onChange={(v) => setSetting("sounds", v)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={playSample}>
            {t.playSample}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}
