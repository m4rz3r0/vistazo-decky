import { findClassModule } from "@decky/ui";
import { safe } from "./safe";
import { Avatar, onSettings, settings } from "./settings";

// The player's picture at the right end of Steam's top bar, in the shape chosen in the settings.
// It is a few CSS rules of Vistazo's own in Steam's window, so it works with or without the
// Obsidiana theme, and "as Steam shows it" leaves nothing there at all.
declare const SteamUIStore: any;

const STYLE = "vistazo-header";

let holder: string | null = null;
function css(shape: Avatar): string {
  if (shape === "steam") return "";
  if (holder === null)
    holder = safe(
      () => (findClassModule((m: any) => m.Header && m.BatteryIcon && m.CurrentUserAvatar) as any)?.CurrentUserAvatar ?? "",
      "",
    );
  if (!holder) return ""; // Steam's top bar changed: it stays as it is
  const me = `.${holder}`;
  if (shape === "rounded") return `${me} .avatar { border-radius: 9px !important; }`;
  // Round: the square frame some profiles wear would not fit, so it steps aside, and the edge
  // that says whether the player is online becomes a dot on the picture's rim.
  return `
${me} .avatar { border-radius: 50% !important; }
${me} .avatarFrame { display: none !important; }
${me} .avatarStatus {
  left: auto !important; top: auto !important; right: -2px !important; bottom: -2px !important;
  width: 9px !important; height: 9px !important; border-radius: 50% !important; box-shadow: 0 0 0 2px #000;
}`;
}

function apply() {
  const doc: Document | undefined = safe(() => SteamUIStore.WindowStore.GamepadUIMainWindowInstance?.BrowserWindow?.document, undefined);
  if (!doc?.head) return;
  const wanted = css(settings().avatar);
  let style = doc.getElementById(STYLE);
  if (!wanted) {
    style?.remove();
    return;
  }
  if (!style) {
    style = doc.createElement("style");
    style.id = STYLE;
    doc.head.appendChild(style);
  }
  if (style.textContent !== wanted) style.textContent = wanted;
}

// Keeps the rules in Steam's window (it may not be there yet at start, and is made again after
// leaving desktop mode); returns what takes them away when Vistazo unloads.
export function watchHeader(): () => void {
  apply();
  const stop = onSettings(apply);
  const again = window.setInterval(apply, 4000);
  return () => {
    stop();
    window.clearInterval(again);
    safe(() => SteamUIStore.WindowStore.GamepadUIMainWindowInstance?.BrowserWindow?.document?.getElementById(STYLE)?.remove(), undefined);
  };
}
