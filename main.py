# Vistazo's backend installs the Obsidiana theme it ships with into CSS Loader's themes folder and,
# when the user pairs it with RomM, holds Vistazo's own RomM key: to refresh achievements after a
# game and, for those who turn it on, to look after RomM games itself (their data, their files and
# how they start). Everything else runs in the frontend.
import asyncio
import json
import os
import re
import shutil
import ssl
import stat
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

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


# ── RomM: Vistazo's own key, for achievements ───────────────────────────────────────────────────
# RomM only reads a player's RetroAchievements progress again when asked (or at night), and asking
# needs "modify your profile". Tender's key leaves that out on purpose, so Vistazo gets its own,
# with only "view your profile" and "modify your profile", through RomM's pairing code: the user
# makes the key in RomM, presses Pair and types the short code here. The key never leaves this file.
# Looking after the games needs more: to see them and their platforms and, for save games, to read
# and write the player's own files. A key is taken only with exactly one of the two sets.
KEY_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "romm.json")
SCOPES = {"me.read", "me.write"}
SCOPES_GAMES = SCOPES | {"roms.read", "platforms.read", "assets.read", "assets.write"}
CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # RomM's pairing alphabet
TIMEOUT = 10
# Decky's Python brings no certificates of its own: the system's are used to check RomM's.
CA_FILES = ("/etc/ssl/certs/ca-certificates.crt", "/etc/ca-certificates/extracted/tls-ca-bundle.pem", "/etc/pki/tls/certs/ca-bundle.crt")


def _tender_server():
    """RomM's address and TLS choice as Tender has them (Vistazo reaches the same server). Only
    those two settings are read; Tender's key and headers are left alone."""
    # Tender keeps them in ~/.config/romm-tender; older layouts used Decky's settings folders.
    home = getattr(decky, "DECKY_USER_HOME", os.path.expanduser("~"))
    files = [os.path.join(home, ".config", "romm-tender", "settings.json")]
    root = os.path.join(decky.DECKY_HOME, "settings")
    try:
        files += [os.path.join(root, name, "settings.json") for name in sorted(os.listdir(root))]
    except OSError:
        pass
    for path in files:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict) or "romm_url" not in data or "romm_api_token" not in data:
            continue
        url = str(data.get("romm_url") or "").strip().rstrip("/")
        parts = urllib.parse.urlsplit(url)
        if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
            return None
        return {"url": url, "insecure": bool(data.get("romm_allow_insecure_ssl", False))}
    return None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """RomM never redirects its API: a redirect is refused, so the key is never sent anywhere else."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _opener(ctx):
    return urllib.request.build_opener(_NoRedirect(), urllib.request.HTTPSHandler(context=ctx))


def _read_key():
    try:
        with open(KEY_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and data.get("token") and data.get("url"):
            return data
    except (OSError, ValueError):
        pass
    return None


def _write_private(path, data):
    """True when the file is safely on disk, for this user only; a half-written copy never stays."""
    tmp = path + ".tmp"
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        return True
    except OSError as e:
        decky.logger.error("%s not saved: %s", os.path.basename(path), e)
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False


def _write_key(data):
    return _write_private(KEY_FILE, data)


def _key_scopes(key):
    """What a stored key may do. Keys from before the wider set say nothing: they are the small one."""
    scopes = key.get("scopes") if isinstance(key, dict) else None
    return {str(x) for x in scopes} if isinstance(scopes, list) else set(SCOPES)


def _games_key():
    """(server, key) when the stored key is for this server and may look after games, else
    (None, why): "unlinked", "moved" or "limited" (a key for achievements only)."""
    key = _read_key()
    server = _tender_server()
    if not key:
        return None, "unlinked"
    if not server or key["url"] != server["url"]:
        return None, "moved"
    if _key_scopes(key) != SCOPES_GAMES:
        return None, "limited"
    return server, key


def _forget_key():
    try:
        os.remove(KEY_FILE)
    except OSError:
        pass


def _prepare(server, method, path, token=None, body=None, accept="application/json"):
    """The request, its body and the TLS setup for one call to RomM."""
    req = urllib.request.Request(server["url"] + path, method=method)
    req.add_header("Accept", accept)
    req.add_header("User-Agent", "Vistazo")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    ctx = None
    if server["url"].startswith("https:"):
        ctx = ssl.create_default_context(cafile=next((f for f in CA_FILES if os.path.isfile(f)), None))
        if server.get("insecure"):
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
    return req, data, ctx


def _request(server, method, path, token=None, body=None):
    """One call to RomM. Returns (status, parsed JSON or None); status 0 when it could not be reached."""
    req, data, ctx = _prepare(server, method, path, token, body)
    try:
        with _opener(ctx).open(req, data=data, timeout=TIMEOUT) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, None
    except (urllib.error.URLError, OSError, ValueError) as e:
        # The reason only (it never carries the key): enough to tell a certificate from a timeout.
        decky.logger.warning("RomM %s %s not reached: %s", method, path.split("?")[0], getattr(e, "reason", e))
        return 0, None


def _number(v):
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def _game(me, ra_id):
    """This game's progress in a /api/users/me answer; zeros for anything unexpected."""
    progression = me.get("ra_progression") if isinstance(me, dict) else None
    results = progression.get("results") if isinstance(progression, dict) else None
    results = [g for g in results if isinstance(g, dict)] if isinstance(results, list) else []
    entry = next((g for g in results if str(g.get("rom_ra_id")) == str(ra_id)), None) or {}
    earned = entry.get("earned_achievements")
    earned = [a for a in earned if isinstance(a, dict)] if isinstance(earned, list) else []
    return {
        "earned": _number(entry.get("num_awarded")),
        "hardcore": _number(entry.get("num_awarded_hardcore")),
        "total": _number(entry.get("max_possible")),
        "ids": [str(a.get("id")) for a in earned if a.get("id") is not None],
        "hardcore_ids": [str(a.get("id")) for a in earned if a.get("id") is not None and a.get("date_hardcore")],
    }


# ── Vistazo's own games ─────────────────────────────────────────────────────────────────────────
# For those who turn it on, Vistazo looks after RomM games itself: what RomM knows of each, its
# file in RetroDECK's folders and how Steam starts it. What it keeps of each game is in one private
# file, by the game's number in Steam. A game starts through the launcher shipped in bin/: Steam
# hands it the game's number in RomM and nothing else, and the launcher finds the file in a private
# list written here (the file's name never goes through Steam's launch options or a shell).
GAMES_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "games.json")
RUNTIME = decky.DECKY_PLUGIN_RUNTIME_DIR
LAUNCHER = os.path.join(RUNTIME, "vistazo-launch")
LAUNCH_FILE = os.path.join(RUNTIME, "launch.json")
LAUNCHER_SOURCE = os.path.join(decky.DECKY_PLUGIN_DIR, "bin", "vistazo-launch")
# RomM's platform -> RetroDECK's folder for it. Only the systems in use; more as they are needed.
SYSTEMS = {
    "nds": "nds", "nintendo-ds": "nds",
    "wii": "wii",
    "ps2": "ps2", "playstation-2": "ps2",
    "psp": "psp", "playstation-portable": "psp",
    "3ds": "n3ds", "n3ds": "n3ds", "nintendo-3ds": "n3ds", "new-nintendo-3ds": "n3ds",
}
CHUNK = 1024 * 1024
STALL = 60  # seconds without a byte before a download gives up
SPARE = 64 * 1024 * 1024  # room left on the disk after a download

_lock = threading.RLock()  # the games file, between the plugin and its downloads
_jobs = {}  # appid -> {"state", "done", "total", "cancel"}: downloads since the plugin started


def _home():
    return getattr(decky, "DECKY_USER_HOME", os.path.expanduser("~"))


def _roms_root():
    """RetroDECK's games folder: where its own settings say, or its usual place."""
    config = os.path.join(_home(), ".var", "app", "net.retrodeck.retrodeck", "config", "retrodeck", "retrodeck.json")
    try:
        with open(config, encoding="utf-8") as f:
            path = json.load(f).get("paths", {}).get("roms_path", "")
        if isinstance(path, str) and os.path.isabs(path):
            return os.path.realpath(path)
    except (OSError, ValueError, AttributeError):
        pass
    return os.path.realpath(os.path.join(_home(), "retrodeck", "roms"))


def _within(path, folder):
    """The real path when it lies inside the folder (links followed), else None."""
    real = os.path.realpath(path)
    return real if real.startswith(os.path.realpath(folder) + os.sep) else None


def _one_name(name):
    """A file name as a single component, or None when nothing safe is left of it."""
    name = os.path.basename(str(name or "").replace("\\", "/"))
    if not name or name in (".", "..") or "\0" in name or len(name.encode("utf-8")) > 240:
        return None
    return name


def _read_games():
    try:
        with open(GAMES_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("games"), dict):
            return data
    except (OSError, ValueError):
        pass
    return {"version": 1, "games": {}}


def _write_games(data):
    """The games file and, from it, the launcher's list: game number in RomM -> its file."""
    if not _write_private(GAMES_FILE, data):
        return False
    table = {}
    for game in data["games"].values():
        if isinstance(game, dict) and game.get("installed") and isinstance(game.get("path"), str):
            table[str(game.get("rom_id"))] = game["path"]
    return _write_private(LAUNCH_FILE, table)


def _install_launcher():
    """The launcher beside its list, in the plugin's own data folder: the plugin's folder is
    replaced on every update, and its files may not be runnable."""
    try:
        with open(LAUNCHER_SOURCE, "rb") as f:
            wanted = f.read()
        try:
            with open(LAUNCHER, "rb") as f:
                same = f.read() == wanted and os.stat(LAUNCHER).st_mode & 0o777 == 0o700
        except OSError:
            same = False
        if not same:
            os.makedirs(RUNTIME, exist_ok=True)
            tmp = LAUNCHER + ".tmp"
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o700)
            with os.fdopen(fd, "wb") as f:
                f.write(wanted)
            os.chmod(tmp, 0o700)
            os.replace(tmp, LAUNCHER)
        return True
    except OSError as e:
        decky.logger.error("Launcher not installed: %s", e)
        return False


def _text(v):
    return v if isinstance(v, str) else ""


def _detail(rom):
    """What the game page shows of RomM's answer for one game; nothing else leaves the backend."""
    meta = rom.get("metadatum") if isinstance(rom.get("metadatum"), dict) else {}
    ra = rom.get("merged_ra_metadata") if isinstance(rom.get("merged_ra_metadata"), dict) else {}
    genres = meta.get("genres") if isinstance(meta.get("genres"), list) else []
    listed = ra.get("achievements") if isinstance(ra.get("achievements"), list) else []
    slug = _text(rom.get("platform_slug"))
    return {
        "rom_id": _number(rom.get("id")),
        "name": _text(rom.get("name")) or _text(rom.get("fs_name_no_ext")),
        "platform": _text(rom.get("platform_display_name")),
        "system": SYSTEMS.get(slug) or SYSTEMS.get(_text(rom.get("platform_fs_slug"))) or "",
        "released": _number(meta.get("first_release_date")),
        "genres": [g for g in genres if isinstance(g, str)][:4],
        "rating": float(meta.get("average_rating") or 0) if isinstance(meta.get("average_rating"), (int, float)) else 0,
        "summary": _text(rom.get("summary")),
        "ra_id": _number(rom.get("ra_id")),
        "size": _number(rom.get("fs_size_bytes")),
        "achievements": [
            {
                "badge_id": str(a.get("badge_id") or ""),
                "title": _text(a.get("title")),
                "description": _text(a.get("description")),
                "points": _number(a.get("points")),
                "num_awarded": _number(a.get("num_awarded")),
                "badge_url": _text(a.get("badge_url")),
                "badge_url_lock": _text(a.get("badge_url_lock")),
                "order": _number(a.get("display_order")),
            }
            for a in listed
            if isinstance(a, dict)
        ],
    }


def _rom(server, key, rom_id):
    """RomM's answer for one game: (the game, None) or (None, why)."""
    status, rom = _request(server, "GET", "/api/roms/%d" % rom_id, key["token"])
    if status == 401:
        # Revoked or expired in RomM: forgotten here, so the settings ask to connect again.
        _forget_key()
        return None, "refused"
    if status == 403:
        return None, "refused"
    if status == 404:
        return None, "game"
    if status != 200 or not isinstance(rom, dict) or _number(rom.get("id")) != rom_id:
        return None, "unreachable"
    return rom, None


def _rom_files(rom):
    """The names and sizes of a game's files, as RomM lists them."""
    files = rom.get("files") if isinstance(rom.get("files"), list) else []
    return [(_text(f.get("file_name")), _number(f.get("file_size_bytes"))) for f in files if isinstance(f, dict)]


def _state(appid, game):
    """One game as the page needs it: whether Vistazo starts it, has its file, and any download."""
    job = _jobs.get(appid)
    out = {
        "managed": bool(game),
        "rom_id": _number((game or {}).get("rom_id")),
        "installed": bool(game and game.get("installed") and os.path.isfile(str(game.get("path") or ""))),
        # Only what Vistazo itself put on the disk is its to remove.
        "removable": bool(game and game.get("installed") and game.get("files")),
        "exe": LAUNCHER,
        "start_dir": RUNTIME,
    }
    if job:
        out["job"] = {"state": job["state"], "done": job["done"], "total": job["total"]}
    return out


class _Stop(Exception):
    """A download that ends early, with the reason the page shows."""


def _fetch(server, token, path, target, job, expected=0):
    """Streams one answer of RomM's into `target` (made new, private). Returns the bytes written;
    raises _Stop when cancelled, stalled, refused or cut short."""
    req, _, ctx = _prepare(server, "GET", path, token, accept="*/*")
    try:
        r = _opener(ctx).open(req, timeout=STALL)
    except urllib.error.HTTPError as e:
        raise _Stop("refused" if e.code in (401, 403) else "game" if e.code == 404 else "unreachable")
    except (urllib.error.URLError, OSError, ValueError) as e:
        decky.logger.warning("RomM download not reached: %s", getattr(e, "reason", e))
        raise _Stop("unreachable")
    with r:
        length = _number(r.headers.get("Content-Length"))
        job["total"] = length or expected
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0), 0o644)
        written = 0
        try:
            with os.fdopen(fd, "wb") as f:
                while True:
                    if job["cancel"].is_set():
                        raise _Stop("cancelled")
                    try:
                        block = r.read(CHUNK)
                    except (OSError, ValueError) as e:
                        decky.logger.warning("RomM download cut short: %s", e)
                        raise _Stop("unreachable")
                    if not block:
                        break
                    f.write(block)
                    written += len(block)
                    job["done"] = written
                f.flush()
                os.fsync(f.fileno())
        except OSError as e:
            decky.logger.error("Download not written: %s", e)
            raise _Stop("disk")
    # Every byte RomM announced, and when it announced none, every byte the game has there.
    if (length and written != length) or (not length and expected and written != expected):
        raise _Stop("unreachable")
    return written


def _unzip(archive, folder, system_dir, job):
    """Takes a RomM archive of a game with several files apart into `folder`, one member at a
    time, each checked to land inside the system's folder. Returns the files made."""
    import zipfile

    made = []
    try:
        with zipfile.ZipFile(archive) as z:
            members = [m for m in z.infolist() if not m.is_dir()]
            if sum(m.file_size for m in members) + SPARE > shutil.disk_usage(system_dir).free:
                raise _Stop("space")
            for m in members:
                parts = [p for p in m.filename.replace("\\", "/").split("/") if p not in ("", ".")]
                if not parts or ".." in parts or any("\0" in p for p in parts) or m.filename.startswith("/"):
                    raise _Stop("archive")
                target = os.path.join(folder, *parts)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                if not _within(os.path.dirname(target), system_dir) or os.path.lexists(target):
                    raise _Stop("archive")
                made.append(target)
                with z.open(m) as src, open(target, "xb") as out:
                    while True:
                        if job["cancel"].is_set():
                            raise _Stop("cancelled")
                        block = src.read(CHUNK)
                        if not block:
                            break
                        out.write(block)
    except (zipfile.BadZipFile, OSError) as e:
        decky.logger.error("Archive not unpacked: %s", e)
        _discard(made, [folder], system_dir)
        raise _Stop("archive")
    except _Stop:
        _discard(made, [folder], system_dir)
        raise
    return made


def _discard(files, folders, system_dir):
    """Removes files Vistazo made and, when left empty, the folders it made for them."""
    for path in files:
        try:
            if _within(path, system_dir) and os.path.isfile(path) and not os.path.islink(path):
                os.remove(path)
        except OSError as e:
            decky.logger.warning("Not removed: %s", e)
    for folder in folders:
        for root, _, _ in os.walk(folder, topdown=False):
            try:
                if _within(root, system_dir):
                    os.rmdir(root)  # only when empty
            except OSError:
                pass


def _download(server, token, rom, job):
    """Brings one game's file from RomM into RetroDECK's folder for its system. Returns what
    the games file keeps of it: {"path", "files", "folders", "size"}; raises _Stop otherwise."""
    system = _detail(rom)["system"]
    if not system:
        raise _Stop("system")
    roms = _roms_root()
    if not os.path.isdir(roms):
        raise _Stop("retrodeck")
    system_dir = os.path.join(roms, system)
    os.makedirs(system_dir, exist_ok=True)
    if not _within(system_dir, roms):
        raise _Stop("retrodeck")
    name = _one_name(rom.get("fs_name"))
    files = _rom_files(rom)
    size = _number(rom.get("fs_size_bytes"))
    if not name or not files:
        raise _Stop("game")
    if size + SPARE > shutil.disk_usage(system_dir).free:
        raise _Stop("space")
    path = "/api/roms/%d/content/%s" % (_number(rom.get("id")), urllib.parse.quote(name, safe=""))
    if len(files) == 1:
        # One file: RomM sends it as it is.
        target = os.path.join(system_dir, _one_name(files[0][0]) or name)
        if os.path.lexists(target):
            # Already there (another program's, or an earlier copy): used as it is when it is
            # whole, and never Vistazo's to remove.
            if os.path.isfile(target) and not os.path.islink(target) and os.path.getsize(target) == files[0][1]:
                return {"path": target, "files": [], "folders": [], "size": files[0][1]}
            raise _Stop("exists")
        part = target + ".part"
        try:
            written = _fetch(server, token, path, part, job, files[0][1])
            if files[0][1] and written != files[0][1]:
                raise _Stop("unreachable")
            os.rename(part, target)
        except OSError as e:
            decky.logger.error("Download not kept: %s", e)
            raise _Stop("disk")
        finally:
            if os.path.lexists(part):
                os.remove(part)
        return {"path": target, "files": [target], "folders": [], "size": written}
    # Several files: RomM sends an archive, with a playlist when the game has discs. They go into
    # a folder of the game's name; what starts is the playlist, or else the largest file.
    folder = os.path.join(system_dir, name)
    if os.path.lexists(folder):
        raise _Stop("exists")
    part = folder + ".zip.part"
    try:
        _fetch(server, token, path, part, job)
        os.mkdir(folder)
        made = _unzip(part, folder, system_dir, job)
    except OSError as e:
        decky.logger.error("Download not kept: %s", e)
        raise _Stop("disk")
    finally:
        if os.path.lexists(part):
            os.remove(part)
    if not made:
        _discard([], [folder], system_dir)
        raise _Stop("archive")
    lists = [f for f in made if f.lower().endswith(".m3u")]
    start = lists[0] if len(lists) == 1 else max(made, key=os.path.getsize)
    return {"path": start, "files": made, "folders": [folder], "size": sum(os.path.getsize(f) for f in made)}


def _installed_path(options, rom):
    """The file another program already put on the disk for this game, read from the launch
    options its shortcut had (…"<file>"), when it is one of the game's own files in RetroDECK's
    folders. None otherwise."""
    found = re.search(r'"((?:[^"\\]|\\.)*)"\s*$', str(options or ""))
    if not found:
        return None
    path = re.sub(r"\\(.)", r"\1", found.group(1))
    names = {n for n, _ in _rom_files(rom)} | {_text(rom.get("fs_name"))}
    if not os.path.isabs(path) or not os.path.isfile(path) or not _within(path, _roms_root()):
        return None
    # The file itself, or the folder it is in, carries the game's name in RomM.
    if os.path.basename(path) in names or os.path.basename(os.path.dirname(path)) in names:
        return os.path.realpath(path)
    return None


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
            # A link would make the copy below write somewhere outside CSS Loader's themes folder.
            if os.path.islink(target):
                return "foreign"
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

    async def romm_status(self):
        """"linked" (a key for the server Tender uses that may look after games), "limited" (the
        same, for achievements only), "unlinked", "moved" (Tender now points elsewhere: pair
        again) or "no-server" (Tender has no RomM)."""
        server = _tender_server()
        key = _read_key()
        if not server:
            return "no-server" if not key else "moved"
        if not key:
            return "unlinked"
        if key["url"] != server["url"]:
            return "moved"
        return "linked" if _key_scopes(key) == SCOPES_GAMES else "limited"

    async def romm_pair(self, code, games=False):
        """Swaps RomM's pairing code for a key: one for achievements, or with `games` one that
        may also look after the games. "ok", "code" (not a code), "invalid" (wrong or expired),
        "scopes" (the key can do more or less than it should), "no-server", "unreachable" or
        "error"."""
        wanted = SCOPES_GAMES if games else SCOPES
        code = "".join(c for c in str(code or "").upper() if c.isalnum())
        if len(code) != 8 or any(c not in CODE_CHARS for c in code):
            return "code"
        server = _tender_server()
        if not server:
            return "no-server"
        loop = asyncio.get_running_loop()
        status, reply = await loop.run_in_executor(None, _request, server, "POST", "/api/client-tokens/exchange", None, {"code": code})
        if status == 0:
            return "unreachable"
        if status in (400, 404, 422):
            return "invalid"
        if status == 429:
            return "unreachable"
        if status not in (200, 201) or not isinstance(reply, dict) or not reply.get("raw_token"):
            return "error"
        token = str(reply["raw_token"])
        scopes = reply.get("scopes")
        scopes = {str(x) for x in scopes} if isinstance(scopes, list) else set()
        token_id = reply.get("id") if isinstance(reply.get("id"), int) else None

        async def revoke():
            # A key that is not kept is thrown away at RomM too (a key may always delete itself).
            if token_id is not None:
                await loop.run_in_executor(None, _request, server, "DELETE", "/api/client-tokens/%d" % token_id, token)

        if scopes != wanted:
            await revoke()
            return "scopes"
        old = _read_key()
        if not _write_key({"url": server["url"], "token": token, "id": token_id, "scopes": sorted(scopes)}):
            await revoke()
            return "error"
        # The key this one replaces is of no use any more: thrown away at RomM too.
        if old and old["url"] == server["url"] and isinstance(old.get("id"), int) and old["token"] != token:
            await loop.run_in_executor(None, _request, server, "DELETE", "/api/client-tokens/%d" % old["id"], old["token"])
        decky.logger.info("RomM key paired")
        return "ok"

    async def romm_unlink(self):
        """Forgets the key, and removes it at RomM when RomM answers."""
        key = _read_key()
        server = _tender_server()
        if key and server and key["url"] == server["url"] and isinstance(key.get("id"), int):
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _request, server, "DELETE", "/api/client-tokens/%d" % int(key["id"]), key["token"])
        _forget_key()
        return "unlinked"

    async def romm_progress(self, ra_id, refresh=False):
        """This game's achievements as RomM has them; with `refresh`, RomM reads them from
        RetroAchievements first and this waits (up to about a minute) for the new figures.
        {"ok": False, "why": ...} when there is no key, RomM is not answering or refuses it."""
        try:
            ra_id = int(ra_id)
        except (TypeError, ValueError):
            return {"ok": False, "why": "game"}
        key = _read_key()
        server = _tender_server()
        if not key:
            return {"ok": False, "why": "unlinked"}
        if not server or key["url"] != server["url"]:
            return {"ok": False, "why": "moved"}
        loop = asyncio.get_running_loop()
        get = lambda *a: loop.run_in_executor(None, _request, server, *a)
        status, me = await get("GET", "/api/users/me", key["token"])
        if status in (401, 403):
            # Revoked or expired in RomM: forgotten here, so the settings ask to connect again.
            _forget_key()
            return {"ok": False, "why": "refused"}
        if status != 200 or not isinstance(me, dict):
            return {"ok": False, "why": "unreachable"}
        before = _game(me, ra_id)
        if refresh and isinstance(me.get("id"), int):
            status, _ = await get("POST", "/api/users/%d/ra/refresh" % me["id"], key["token"], {"incremental": True})
            if status in (401, 403):
                _forget_key()
                return {"ok": False, "why": "refused"}
            if status in (200, 202, 204):
                # RomM does it in the background: its answer changes when it is done.
                deadline = time.monotonic() + 60
                while time.monotonic() < deadline:
                    await asyncio.sleep(4)
                    status, now = await get("GET", "/api/users/me", key["token"])
                    if status == 200 and isinstance(now, dict):
                        game = _game(now, ra_id)
                        if game != before or now.get("ra_progression") != me.get("ra_progression"):
                            return {"ok": True, "changed": True, **game}
                # RomM did not finish in time: these figures are not newer than anyone else's.
                return {"ok": True, "changed": False, **before}
        return {"ok": True, "changed": False, **before}

    async def romm_game(self, rom_id):
        """One game as RomM has it, for its page. {"ok": False, "why": ...} without a key that
        may see the games, or when RomM is not answering or refuses."""
        rom_id = _number(rom_id)
        if rom_id <= 0:
            return {"ok": False, "why": "game"}
        server, key = _games_key()
        if not server:
            return {"ok": False, "why": key}
        rom, why = await asyncio.get_running_loop().run_in_executor(None, _rom, server, key, rom_id)
        if not rom:
            return {"ok": False, "why": why}
        return {"ok": True, **_detail(rom)}

    async def game_state(self, appid):
        """Whether Vistazo looks after this Steam game, has its file, and how a download goes."""
        appid = _number(appid)
        with _lock:
            return _state(appid, _read_games()["games"].get(str(appid)))

    async def game_take(self, appid, rom_id, exe="", start_dir="", options=""):
        """Vistazo starts this game from now on. `exe`, `start_dir` and `options` are what its
        Steam shortcut had, kept to give it back (game_release). Answers with what to put in
        the shortcut: {"ok": True, "exe", "start_dir", "options", ...game_state}."""
        appid, rom_id = _number(appid), _number(rom_id)
        if appid <= 0 or rom_id <= 0:
            return {"ok": False, "why": "game"}
        server, key = _games_key()
        if not server:
            return {"ok": False, "why": key}
        if not _install_launcher():
            return {"ok": False, "why": "disk"}
        rom, why = await asyncio.get_running_loop().run_in_executor(None, _rom, server, key, rom_id)
        if not rom:
            return {"ok": False, "why": why}
        detail = _detail(rom)
        with _lock:
            data = _read_games()
            game = data["games"].get(str(appid))
            if not game:
                # A file the shortcut already started stays where it is, and is not Vistazo's.
                path = _installed_path(options, rom)
                game = {
                    "rom_id": rom_id,
                    "platform": _text(rom.get("platform_slug")),
                    "system": detail["system"],
                    "path": path,
                    "size": detail["size"],
                    "installed": bool(path),
                    "files": [],
                    "folders": [],
                    "before": {"exe": str(exe or ""), "start_dir": str(start_dir or ""), "options": str(options or "")},
                    "saves": {},
                }
                data["games"][str(appid)] = game
                if not _write_games(data):
                    return {"ok": False, "why": "disk"}
            elif _number(game.get("rom_id")) != rom_id:
                return {"ok": False, "why": "game"}
            return {"ok": True, "options": str(rom_id), **_state(appid, game)}

    async def game_release(self, appid):
        """Vistazo lets go of this game. Answers with what its shortcut had before, to put back:
        {"ok": True, "exe", "start_dir", "options"}. The game's file stays on the disk."""
        appid = _number(appid)
        with _lock:
            job = _jobs.get(appid)
            if job and job["state"] == "downloading":
                return {"ok": False, "why": "busy"}
            data = _read_games()
            game = data["games"].pop(str(appid), None)
            if not game:
                return {"ok": False, "why": "game"}
            if not _write_games(data):
                return {"ok": False, "why": "disk"}
            _jobs.pop(appid, None)
            before = game.get("before") if isinstance(game.get("before"), dict) else {}
            return {"ok": True, **{k: _text(before.get(k)) for k in ("exe", "start_dir", "options")}}

    async def game_download(self, appid):
        """Starts bringing this game's file from RomM; game_state tells how it goes."""
        appid = _number(appid)
        server, key = _games_key()
        if not server:
            return {"ok": False, "why": key}
        with _lock:
            game = _read_games()["games"].get(str(appid))
            if not game:
                return {"ok": False, "why": "game"}
            job = _jobs.get(appid)
            if job and job["state"] == "downloading":
                return {"ok": True, **_state(appid, game)}
            if game.get("installed") and os.path.isfile(str(game.get("path") or "")):
                return {"ok": True, **_state(appid, game)}
            job = {"state": "downloading", "done": 0, "total": _number(game.get("size")), "cancel": threading.Event()}
            _jobs[appid] = job
        rom_id = _number(game.get("rom_id"))

        def run():
            try:
                rom, why = _rom(server, key, rom_id)
                if not rom:
                    raise _Stop(why)
                got = _download(server, key["token"], rom, job)
            except _Stop as stop:
                job["state"] = str(stop)
                return
            except Exception as e:  # never leave a download hanging in "downloading"
                decky.logger.error("Download failed: %s", e)
                job["state"] = "error"
                return
            with _lock:
                data = _read_games()
                kept = data["games"].get(str(appid))
                if kept is None or _number(kept.get("rom_id")) != rom_id:
                    _discard(got["files"], got["folders"], os.path.join(_roms_root(), _detail(rom)["system"]))
                    job["state"] = "cancelled"
                    return
                kept.update(path=got["path"], files=got["files"], folders=got["folders"], size=got["size"], installed=True)
                job["state"] = "installed" if _write_games(data) else "disk"

        asyncio.get_running_loop().run_in_executor(None, run)
        return {"ok": True, **_state(appid, game)}

    async def game_cancel(self, appid):
        job = _jobs.get(_number(appid))
        if job and job["state"] == "downloading":
            job["cancel"].set()
        return await self.game_state(appid)

    async def game_remove(self, appid):
        """Takes this game's file off the disk: only files Vistazo itself brought."""
        appid = _number(appid)
        with _lock:
            job = _jobs.get(appid)
            if job and job["state"] == "downloading":
                return {"ok": False, "why": "busy"}
            data = _read_games()
            game = data["games"].get(str(appid))
            if not game:
                return {"ok": False, "why": "game"}
            files = [f for f in game.get("files") or [] if isinstance(f, str)]
            if not files:
                return {"ok": False, "why": "not-ours"}
            system_dir = os.path.join(_roms_root(), _text(game.get("system")))
            # Forgotten first: a game without its file must never be left marked as installed.
            folders = [f for f in game.get("folders") or [] if isinstance(f, str)]
            game.update(installed=False, path=None, files=[], folders=[])
            if not _write_games(data):
                return {"ok": False, "why": "disk"}
            _discard(files, folders, system_dir)
            _jobs.pop(appid, None)
            return {"ok": True, **_state(appid, game)}

    async def _main(self):
        with _lock:
            data = _read_games()
            if data["games"]:
                _install_launcher()
                _write_games(data)

    async def _unload(self):
        for job in list(_jobs.values()):
            job["cancel"].set()
