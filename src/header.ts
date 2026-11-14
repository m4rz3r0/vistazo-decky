import { findClassModule } from "@decky/ui";
import { safe } from "./safe";
import { Avatar, onSettings, settings } from "./settings";

// The player's picture at the right end of Steam's top bar, in the shape chosen in the settings.
// It is a few CSS rules of Vistazo's own in Steam's window, so it works with or without the
// Obsidiana theme, and "as Steam shows it" leaves nothing there at all. Round is how it comes.
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
  // The square frame some profiles wear covers the corners, so it steps aside in both shapes.
  // Steam shows that edge with a rule of its own that outweighs a plain one.
  const status = `${me} .avatarHolder .avatarStatus.avatarStatus`;
  const noFrame = `${me} .avatarFrame { display: none !important; }`;
  if (shape === "rounded")
    return `${me} .avatar { border-radius: 10px !important; } ${noFrame} ${status} { border-radius: 2px !important; }`;
  // Round: the straight edge that says whether the player is online becomes a dot on the
  // picture's rim, in the colours Vistazo's own status menu uses (green: online; mint: playing;
  // amber: away; grey: offline), not Steam's blue.
  return `
${me} .avatar { border-radius: 50% !important; }
${noFrame}
${status} {
  left: auto !important; top: auto !important; right: -2px !important; bottom: -2px !important;
  width: 9px !important; height: 9px !important; border-radius: 50% !important; box-shadow: 0 0 0 2px #000;
  background-color: #5fc97e !important;
}
${me} .avatarHolder.ingame .avatarStatus.avatarStatus { background-color: var(--obs-ingame, #5fd8a0) !important; }
${me} .avatarHolder:is(.away, .awayOrSnooze, .snooze) .avatarStatus.avatarStatus { background-color: #f2c94c !important; }
${me} .avatarHolder.offline .avatarStatus.avatarStatus { background-color: #8a8a8a !important; }`;
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
