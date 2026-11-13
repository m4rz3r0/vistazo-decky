# Vistazo's backend installs the Obsidiana theme it ships with into CSS Loader's themes folder and,
# when the user pairs it with RomM, holds Vistazo's own RomM key to refresh achievements after a game.
# Everything else runs in the frontend.
import asyncio
import json
import os
import shutil
import ssl
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
KEY_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "romm.json")
SCOPES = {"me.read", "me.write"}
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


def _write_key(data):
    """True when the key is safely on disk; a half-written copy never stays behind."""
    tmp = KEY_FILE + ".tmp"
    try:
        os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, KEY_FILE)
        return True
    except OSError as e:
        decky.logger.error("RomM key not saved: %s", e)
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False


def _forget_key():
    try:
        os.remove(KEY_FILE)
    except OSError:
        pass


def _request(server, method, path, token=None, body=None):
    """One call to RomM. Returns (status, parsed JSON or None); status 0 when it could not be reached."""
    req = urllib.request.Request(server["url"] + path, method=method)
    req.add_header("Accept", "application/json")
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
        """"linked" (a key for the server Tender uses), "unlinked", "moved" (Tender now points
        elsewhere: pair again) or "no-server" (Tender has no RomM)."""
        server = _tender_server()
        key = _read_key()
        if not server:
            return "no-server" if not key else "moved"
        if not key:
            return "unlinked"
        return "linked" if key["url"] == server["url"] else "moved"

    async def romm_pair(self, code):
        """Swaps RomM's pairing code for a key. "ok", "code" (not a code), "invalid" (wrong or
        expired), "scopes" (the key can do more or less than it should), "no-server",
        "unreachable" or "error"."""
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

        if scopes != SCOPES:
            await revoke()
            return "scopes"
        if not _write_key({"url": server["url"], "token": token, "id": token_id}):
            await revoke()
            return "error"
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

    async def _main(self):
        pass

    async def _unload(self):
        pass
