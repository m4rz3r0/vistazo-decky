# Vistazo's backend only installs the Obsidiana theme it ships with into CSS Loader's themes folder.
# Everything else runs in the frontend.
import json
import os
import shutil

import decky

THEME = "Obsidiana"
BUNDLED = os.path.join(decky.DECKY_PLUGIN_DIR, "theme", THEME)
# CSS Loader keeps its themes here (css_utils.get_theme_path).
THEMES = os.path.join(decky.DECKY_HOME, "themes")


def _manifest(folder):
    try:
        with open(os.path.join(folder, "theme.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _version(manifest):
    # "v1.2" -> (1, 2); anything unreadable sorts first so a good copy replaces it.
    raw = str((manifest or {}).get("version", "")).lstrip("vV")
    try:
        return tuple(int(part) for part in raw.split("."))
    except ValueError:
        return ()


class Plugin:
    async def install_theme(self):
        """Copies the bundled theme when it is missing or older. Returns what happened:
        "fresh" (first copy), "updated", "current", "no-loader" (no CSS Loader themes folder),
        "foreign" (another theme with the same name) or "error"."""
        try:
            bundled = _manifest(BUNDLED)
            if bundled is None:
                return "error"
            if not os.path.isdir(THEMES):
                return "no-loader"
            target = os.path.join(THEMES, THEME)
            installed = _manifest(target)
            if os.path.exists(target) and installed is None:
                return "foreign"  # a folder with that name that isn't a readable theme: leave it
            if installed is not None and installed.get("author") != bundled.get("author"):
                return "foreign"
            if installed is not None and _version(installed) >= _version(bundled):
                return "current"
            # Copy file by file over the old version: config_USER.json, where CSS Loader keeps
            # the options the user chose, stays untouched. theme.json goes last, so a copy cut
            # short keeps the old version number and is tried again on the next start.
            shutil.copytree(BUNDLED, target, dirs_exist_ok=True,
                            ignore=lambda folder, names: ["theme.json"] if folder == BUNDLED else [])
            shutil.copy2(os.path.join(BUNDLED, "theme.json"), os.path.join(target, "theme.json"))
            decky.logger.info("Obsidiana %s installed", bundled.get("version"))
            return "fresh" if installed is None else "updated"
        except Exception as e:  # never break the plugin over the theme
            decky.logger.error("Obsidiana install failed: %s", e)
            return "error"

    async def _main(self):
        pass

    async def _unload(self):
        pass
