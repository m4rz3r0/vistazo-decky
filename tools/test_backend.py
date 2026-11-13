#!/usr/bin/env python3
"""Backend checks against a pretend RomM, all inside a throwaway folder: `python3 tools/test_backend.py`.

Nothing here talks to a real server or touches the real home: `decky` is a stand-in pointing at
the temporary folder, and "flatpak" is a script that only writes down what it was started with."""
import asyncio
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
import types
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix="vistazo-test-")
HOME = os.path.join(TMP, "home")
ROMS = os.path.join(HOME, "retrodeck", "roms")
PLUGIN = os.path.join(TMP, "plugin")
os.makedirs(os.path.join(HOME, ".config", "romm-tender"))
os.makedirs(os.path.join(ROMS, "nds"))
os.makedirs(os.path.join(PLUGIN, "bin"))
shutil.copy(os.path.join(REPO, "bin", "vistazo-launch"), os.path.join(PLUGIN, "bin", "vistazo-launch"))

decky = types.ModuleType("decky")
decky.DECKY_PLUGIN_DIR = PLUGIN
decky.DECKY_HOME = os.path.join(TMP, "homebrew")
decky.DECKY_USER_HOME = HOME
decky.DECKY_PLUGIN_SETTINGS_DIR = os.path.join(TMP, "settings")
decky.DECKY_PLUGIN_RUNTIME_DIR = os.path.join(TMP, "runtime")
decky.logger = types.SimpleNamespace(info=lambda *a: None, warning=lambda *a: None, error=lambda *a: None)
sys.modules["decky"] = decky
sys.dont_write_bytecode = True
sys.path.insert(0, REPO)
import main  # noqa: E402

BASIC = ["me.read", "me.write"]
GAMES = BASIC + ["roms.read", "platforms.read", "collections.read", "firmware.read", "assets.read", "assets.write"]
NASTY = 'Po ké "mon" $(touch pwned); `id` \\ & .nds'
DATA = os.urandom(300_000)


class RomM:
    """What the pretend server knows, and what it was asked."""

    def __init__(self):
        self.calls = []  # (method, path, bearer)
        self.codes = {}  # pairing code -> (token id, scopes)
        self.tokens = {}  # raw token -> id
        self.deleted = []
        self.roms = {}
        self.content = {}  # rom id -> bytes, or a callable(handler)
        self.redirect_to = None
        self.refuse = set()  # rom ids answered with 401
        self.covers = {}  # file name -> bytes


romm = RomM()


def rom(rom_id, name, files=None, slug="nds", **more):
    files = files if files is not None else [(name, len(DATA))]
    return {
        "id": rom_id, "name": "Game %d" % rom_id, "fs_name": name, "fs_name_no_ext": name.rsplit(".", 1)[0],
        "platform_slug": slug, "platform_fs_slug": slug, "platform_display_name": "Nintendo DS",
        "fs_size_bytes": sum(s for _, s in files), "summary": "A game.", "ra_id": 77,
        "metadatum": {"genres": ["RPG", "Adventure"], "first_release_date": 1252713600, "average_rating": 87.5},
        "merged_ra_metadata": {"achievements": [{"badge_id": "100", "title": "First", "num_awarded": 9, "points": 5,
                                                 "badge_url": "https://media.retroachievements.org/Badge/100.png"}]},
        "files": [{"id": i, "file_name": n, "file_size_bytes": s} for i, (n, s) in enumerate(files, 1)],
        "user_saves": [{"secret": "never leaves the backend"}],
        **more,
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def reply(self, status, body=None, headers=()):
        raw = json.dumps(body).encode() if body is not None else b""
        self.send_response(status)
        for k, v in headers:
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def handle_one(self, method):
        bearer = (self.headers.get("Authorization") or "").removeprefix("Bearer ")
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length)) if length else None
        romm.calls.append((method, self.path, bearer))
        parts = self.path.split("?")[0].strip("/").split("/")
        if self.path == "/api/client-tokens/exchange":
            hit = romm.codes.get((body or {}).get("code"))
            if not hit:
                return self.reply(404)
            token = "tok-%d" % hit[0]
            romm.tokens[token] = hit[0]
            return self.reply(200, {"id": hit[0], "raw_token": token, "scopes": hit[1]})
        if method == "DELETE" and parts[:2] == ["api", "client-tokens"]:
            romm.deleted.append((int(parts[2]), bearer))
            return self.reply(204)
        if bearer not in romm.tokens:
            return self.reply(401)
        if self.path == "/api/users/me":
            return self.reply(200, {"id": 1, "ra_progression": {"results": [
                {"rom_ra_id": 77, "num_awarded": 2, "num_awarded_hardcore": 1, "max_possible": 130,
                 "earned_achievements": [{"id": "100", "date_hardcore": "x"}, {"id": "101"}]}]}})
        if parts[:4] == ["assets", "romm", "resources", "roms"]:
            raw = romm.covers.get(parts[-1])
            if raw is None:
                return self.reply(404)
            self.send_response(200)
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        if parts[:2] == ["api", "roms"] and len(parts) == 3:
            rom_id = int(parts[2])
            if romm.redirect_to:
                return self.reply(302, headers=[("Location", romm.redirect_to + self.path)])
            if rom_id in romm.refuse:
                return self.reply(401)
            return self.reply(200, romm.roms[rom_id]) if rom_id in romm.roms else self.reply(404)
        if parts[:2] == ["api", "roms"] and len(parts) == 5 and parts[3] == "content":
            content = romm.content.get(int(parts[2]))
            if content is None:
                return self.reply(404)
            if callable(content):
                return content(self)
            self.send_response(200)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        self.reply(404)

    def do_GET(self):
        self.handle_one("GET")

    def do_POST(self):
        self.handle_one("POST")

    def do_DELETE(self):
        self.handle_one("DELETE")


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = "http://127.0.0.1:%d" % server.server_port
# A second address, standing for "somewhere else": a redirect there must never be followed.
other = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=other.serve_forever, daemon=True).start()
OTHER = "http://127.0.0.1:%d" % other.server_port


def tender(url):
    with open(os.path.join(HOME, ".config", "romm-tender", "settings.json"), "w") as f:
        json.dump({"romm_url": url, "romm_api_token": "tender-own-key"}, f)


plugin = main.Plugin()
# One loop for the whole run, as in Decky: a download goes on after the call that started it.
loop = asyncio.new_event_loop()
threading.Thread(target=loop.run_forever, daemon=True).start()


def run(call):
    return asyncio.run_coroutine_threadsafe(call, loop).result(30)


checks = 0


def check(what, got, want=True):
    global checks
    checks += 1
    if got != want:
        raise AssertionError("%s: got %r, wanted %r" % (what, got, want))


def mode(path):
    return stat.S_IMODE(os.stat(path).st_mode)


def wait(appid, timeout=10):
    """The state a download ends in."""
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        state = run(plugin.game_state(appid))
        if state.get("job", {}).get("state") != "downloading":
            return state
        time.sleep(0.02)
    raise AssertionError("download did not end")


def leftovers():
    return sorted(n for _, _, names in os.walk(ROMS) for n in names if n.endswith(".part"))


def pair(code, games=False):
    return run(plugin.romm_pair(code, games))


def test_key():
    tender(URL)
    check("no key yet", run(plugin.romm_status()), "unlinked")
    check("nothing to check", run(plugin.romm_check()), "unlinked")
    check("games need a key", run(plugin.romm_game(5)), {"ok": False, "why": "unlinked"})
    check("not a code", pair("abc")["result"], "code")
    check("unknown code", pair("ZZZZZZZZ")["result"], "invalid")

    # A key for achievements only is still taken, as before, and says what it is.
    romm.codes["ABCDEFGH"] = (1, BASIC)
    check("small key paired", pair("abcd-efgh"), {"result": "ok", "missing": [], "extra": []})
    check("small key status", run(plugin.romm_status()), "limited")
    check("small key works", run(plugin.romm_check()), "ok")
    check("key file private", mode(main.KEY_FILE), 0o600)
    check("small key reads achievements", run(plugin.romm_progress(77))["earned"], 2)
    check("small key sees no games", run(plugin.romm_game(5)), {"ok": False, "why": "limited"})
    check("small key takes no game", run(plugin.game_take(900, 5))["why"], "limited")
    check("small key downloads nothing", run(plugin.game_download(900))["why"], "limited")
    check("no game was asked for", [c for c in romm.calls if "/api/roms" in c[1]], [])

    # A key stored before the wider set says nothing of what it may do: the small one.
    with open(main.KEY_FILE) as f:
        old = json.load(f)
    old.pop("scopes")
    main._write_key(old)
    check("old stored key", run(plugin.romm_status()), "limited")
    check("old stored key still reads achievements", run(plugin.romm_progress(77))["ok"], True)

    # Asked to look after the games, a key short of the set is kept for what it can do, and the
    # answer names what it lacks.
    romm.codes["JKMNPQRS"] = (2, BASIC + ["roms.read", "platforms.read", "assets.read", "assets.write"])
    check("short key kept, with what it lacks", pair("JKMNPQRS", True),
          {"result": "limited", "missing": ["collections.read", "firmware.read"], "extra": []})
    check("short key status", run(plugin.romm_status()), "limited")
    check("the key it replaced is revoked", romm.deleted[-1], (1, "tok-1"))

    # A key that can do more than Vistazo should ever hold, or less than it always needs, is
    # thrown away at RomM, and the answer names why. The stored one stays.
    romm.codes["TUVWXYZ2"] = (3, GAMES + ["roms.write", "users.write"])
    check("wider key refused", pair("TUVWXYZ2", True), {"result": "scopes", "missing": [], "extra": ["roms.write", "users.write"]})
    check("wider key revoked", romm.deleted[-1], (3, "tok-3"))
    romm.codes["23456789"] = (4, ["me.read", "roms.read"])
    check("key without the basics refused", pair("23456789"), {"result": "scopes", "missing": ["me.write"], "extra": []})
    check("it is revoked too", romm.deleted[-1], (4, "tok-4"))
    check("kept key untouched", run(plugin.romm_status()), "limited")

    # The whole set, whichever way it was asked for: good for everything.
    romm.codes["HGFEDCBA"] = (5, list(reversed(GAMES)))
    check("wide key paired", pair("HGFEDCBA"), {"result": "ok", "missing": [], "extra": []})
    check("wide key status", run(plugin.romm_status()), "linked")
    check("key file private", mode(main.KEY_FILE), 0o600)
    check("the key it replaced is revoked", romm.deleted[-1], (2, "tok-2"))
    check("wide key still reads achievements", run(plugin.romm_progress(77))["hardcore"], 1)

    # A key RomM no longer accepts is forgotten when asked about.
    kept = dict(romm.tokens)
    romm.tokens.clear()
    check("revoked at RomM", run(plugin.romm_check()), "refused")
    check("forgotten", run(plugin.romm_status()), "unlinked")
    romm.tokens.update(kept)
    romm.codes["HGFEDCBA"] = (5, GAMES)
    check("paired again", pair("HGFEDCBA", True)["result"], "ok")


def test_detail():
    romm.roms[5] = rom(5, "Game.nds")
    got = run(plugin.romm_game(5))
    check("detail ok", got["ok"], True)
    check("detail fields", (got["rom_id"], got["platform"], got["system"], got["ra_id"], got["rating"], got["released"]),
          (5, "Nintendo DS", "nds", 77, 87.5, 1252713600))
    check("achievements listed", got["achievements"][0]["badge_id"], "100")
    check("nothing else leaves the backend", "user_saves" in got or "files" in got, False)
    check("unknown game", run(plugin.romm_game(404)), {"ok": False, "why": "game"})
    check("not a number", run(plugin.romm_game("x")), {"ok": False, "why": "game"})

    # A redirect is never followed: the key reaches no other address.
    romm.redirect_to = OTHER
    before = len(romm.calls)
    check("redirect refused", run(plugin.romm_game(5)), {"ok": False, "why": "unreachable"})
    check("one call only, none to the other address", len(romm.calls) - before, 1)
    romm.redirect_to = None

    # Tender pointing elsewhere: the key is for the server it was paired with, and stays home.
    tender(OTHER)
    before = len(romm.calls)
    check("moved", run(plugin.romm_game(5)), {"ok": False, "why": "moved"})
    check("moved: nothing sent", len(romm.calls), before)
    tender(URL)


def test_cover():
    png = b"\x89PNG\r\n\x1a\n" + b"picture"
    romm.covers = {"big.png": png, "page.png": b"<html>sign in</html>", "huge.png": b"\x89PNG\r\n\x1a\n" + b"x" * main.COVER_MAX}
    romm.roms[20] = rom(20, "Cover.nds", path_cover_large="/assets/romm/resources/roms/20/cover/big.png?ts=1")
    got = run(plugin.game_cover(20))
    check("cover", (got["ok"], got["kind"], __import__("base64").b64decode(got["data"])), (True, "png", png))
    for name, path in (("not a picture", "/assets/romm/resources/roms/20/cover/page.png"), ("too big", "/assets/romm/resources/roms/20/cover/huge.png"),
                       ("missing", "/assets/romm/resources/roms/20/cover/none.png"), ("outside the covers", "/assets/romm/resources/roms/../../../api/users/me"), ("elsewhere", "/api/users/me"), ("another site", "https://example.org/x.png"), ("none", None)):
        romm.roms[20]["path_cover_large"] = path
        before = len(romm.calls)
        check("cover %s" % name, run(plugin.game_cover(20)), {"ok": False, "why": "cover"})
        if name in ("outside the covers", "elsewhere", "another site", "none"):
            check("cover %s: only the game was asked for" % name, len(romm.calls) - before, 1)
    got = run(plugin.game_launcher())
    check("launcher ready", (got["ok"], got["exe"], mode(main.LAUNCHER)), (True, main.LAUNCHER, 0o700))
    check("no games yet", run(plugin.game_list()), {})


def test_launcher():
    nasty = os.path.join(ROMS, "nds", NASTY)
    with open(nasty, "wb") as f:
        f.write(b"rom")
    romm.roms[6] = rom(6, NASTY, files=[(NASTY, 3)])
    # What Tender's shortcut holds: its launcher, and the file inside quotes with \ and " escaped.
    escaped = nasty.replace("\\", "\\\\").replace('"', '\\"')
    before = {"exe": "/tender/bin/rom-launcher", "start_dir": "/tender/bin",
              "options": 'flatpak run net.retrodeck.retrodeck -e "%%EMULATOR%% %%ROM%%" "%s"' % escaped}
    got = run(plugin.game_take(600, 6, **before))
    check("taken", (got["ok"], got["options"], got["exe"], got["installed"], got["removable"]),
          (True, "6", main.LAUNCHER, True, False))
    check("launcher runnable, private", mode(main.LAUNCHER), 0o700)
    check("games file private", mode(main.GAMES_FILE), 0o600)
    check("launch list private", mode(main.LAUNCH_FILE), 0o600)
    with open(main.LAUNCH_FILE) as f:
        check("launch list", json.load(f), {"6": os.path.realpath(nasty)})
    check("listed", run(plugin.game_list()), {"600": 6})
    check("taking it twice changes nothing", run(plugin.game_take(600, 6, "x", "y", "z"))["ok"], True)

    # The launcher hands the file to flatpak as one argument, whatever its name holds.
    fake_bin = os.path.join(TMP, "bin")
    os.makedirs(fake_bin)
    seen = os.path.join(TMP, "flatpak-args.json")
    with open(os.path.join(fake_bin, "flatpak"), "w") as f:
        f.write("#!/usr/bin/python3\nimport json, sys\njson.dump(sys.argv[1:], open(%r, 'w'))\n" % seen)
    os.chmod(os.path.join(fake_bin, "flatpak"), 0o755)
    env = {"PATH": fake_bin + ":/usr/bin:/bin", "HOME": HOME}
    work = os.path.join(TMP, "cwd")
    os.makedirs(work)

    def launch(*args):
        return subprocess.run([main.LAUNCHER, *args], env=env, cwd=work, capture_output=True, text=True)

    done = launch("6")
    check("launcher ran", done.returncode, 0)
    with open(seen) as f:
        check("flatpak got the file as one argument", json.load(f),
              ["run", "net.retrodeck.retrodeck", os.path.realpath(nasty)])
    check("the name ran nothing", os.listdir(work), [])
    os.remove(seen)
    for bad in (["7"], ["6", "extra"], [], ["6; touch x"], ["../6"], ["-6"], ["٦"]):
        check("refused %r" % bad, launch(*bad).returncode, 2)
    # A list anyone else could write is not believed.
    os.chmod(main.LAUNCH_FILE, 0o666)
    check("loose list refused", launch("6").returncode, 2)
    os.chmod(main.LAUNCH_FILE, 0o600)
    check("flatpak never started for those", os.path.exists(seen), False)

    # A file outside RetroDECK's folders, or one that is not this game's, is not taken as installed.
    outside = os.path.join(TMP, "outside.nds")
    open(outside, "wb").close()
    romm.roms[7] = rom(7, "outside.nds")
    check("outside file ignored", run(plugin.game_take(700, 7, "e", "d", 'x "%s"' % outside))["installed"], False)
    romm.roms[8] = rom(8, "Another.nds")
    check("other game's file ignored", run(plugin.game_take(800, 8, "e", "d", 'x "%s"' % escaped))["installed"], False)
    check("same Steam game, another RomM game", run(plugin.game_take(800, 6))["why"], "game")

    # Undo: the shortcut's old values come back whole and the game leaves the launcher's list.
    check("given back", run(plugin.game_release(600)), {"ok": True, **before})
    with open(main.LAUNCH_FILE) as f:
        check("gone from the launch list", json.load(f), {})
    check("its file stays", os.path.isfile(nasty), True)
    check("no longer Vistazo's", run(plugin.game_state(600))["managed"], False)
    check("nothing to give back twice", run(plugin.game_release(600))["why"], "game")
    for appid in (700, 800):
        run(plugin.game_release(appid))
    os.remove(nasty)


def test_download():
    target = os.path.join(ROMS, "nds", "Game.nds")
    romm.content[5] = DATA
    check("take", run(plugin.game_take(500, 5))["installed"], False)
    check("download starts", run(plugin.game_download(500))["ok"], True)
    state = wait(500)
    check("downloaded", (state["job"]["state"], state["installed"], state["removable"]), ("installed", True, True))
    with open(target, "rb") as f:
        check("file whole", f.read() == DATA, True)
    check("nothing half-done left", leftovers(), [])
    with open(main.LAUNCH_FILE) as f:
        check("in the launch list", json.load(f), {"5": target})
    asked = [c for c in romm.calls if "/content/" in c[1]][-1]
    check("asked with Vistazo's key", asked, ("GET", "/api/roms/5/content/Game.nds", "tok-5"))

    # Removing takes only what Vistazo brought.
    neighbour = os.path.join(ROMS, "nds", "Neighbour.nds")
    open(neighbour, "wb").close()
    removed = run(plugin.game_remove(500))
    check("removed", (removed["ok"], removed["installed"], os.path.exists(target)), (True, False, False))
    check("neighbour stays", os.path.isfile(neighbour), True)
    with open(main.LAUNCH_FILE) as f:
        check("out of the launch list", json.load(f), {})
    check("nothing to remove twice", run(plugin.game_remove(500))["why"], "not-ours")

    # Cut short: RomM announces more than it sends.
    def short(h):
        h.send_response(200)
        h.send_header("Content-Length", str(len(DATA)))
        h.end_headers()
        h.wfile.write(DATA[:1000])
        h.wfile.flush()
        h.connection.close()

    romm.content[5] = short
    run(plugin.game_download(500))
    state = wait(500)
    check("cut short", (state["job"]["state"], state["installed"]), ("unreachable", False))
    check("cut short leaves nothing", (os.path.exists(target), leftovers()), (False, []))

    # A whole answer of the wrong size is not the game either.
    romm.content[5] = DATA[:-1]
    run(plugin.game_download(500))
    check("wrong size", wait(500)["job"]["state"], "unreachable")
    check("wrong size leaves nothing", (os.path.exists(target), leftovers()), (False, []))

    # Cancelled half way.
    going = threading.Event()

    def slow(h):
        h.send_response(200)
        h.send_header("Content-Length", str(len(DATA)))
        h.end_headers()
        try:
            for i in range(0, len(DATA), 1000):
                h.wfile.write(DATA[i:i + 1000])
                h.wfile.flush()
                going.set()
                time.sleep(0.005)
        except OSError:
            pass

    main.CHUNK = 4096
    romm.content[5] = slow
    run(plugin.game_download(500))
    going.wait(5)
    check("busy while downloading", run(plugin.game_release(500))["why"], "busy")
    check("no removing while downloading", run(plugin.game_remove(500))["why"], "busy")
    run(plugin.game_cancel(500))
    check("cancelled", wait(500)["job"]["state"], "cancelled")
    check("cancelled leaves nothing", (os.path.exists(target), leftovers()), (False, []))
    main.CHUNK = 1024 * 1024

    # A file already there: used when whole (and never Vistazo's to remove), refused otherwise.
    romm.content[5] = DATA
    with open(target, "wb") as f:
        f.write(b"someone else's")
    run(plugin.game_download(500))
    check("in the way", wait(500)["job"]["state"], "exists")
    with open(target, "rb") as f:
        check("left as it was", f.read(), b"someone else's")
    with open(target, "wb") as f:
        f.write(DATA)
    run(plugin.game_download(500))
    state = wait(500)
    check("already whole", (state["job"]["state"], state["installed"], state["removable"]), ("installed", True, False))
    check("not Vistazo's to remove", run(plugin.game_remove(500))["why"], "not-ours")
    check("still there", os.path.isfile(target), True)
    os.remove(target)
    run(plugin.game_release(500))

    # A name with folders in it lands as one name inside the system's folder.
    romm.roms[9] = rom(9, "../../evil.nds", files=[("../../../evil.nds", len(DATA))])
    romm.content[9] = DATA
    run(plugin.game_take(900, 9))
    run(plugin.game_download(900))
    check("odd name downloaded", wait(900)["job"]["state"], "installed")
    check("kept inside", os.path.isfile(os.path.join(ROMS, "nds", "evil.nds")), True)
    check("nothing outside", [n for n in os.listdir(HOME) + os.listdir(os.path.dirname(ROMS)) if "evil" in n], [])
    run(plugin.game_remove(900))
    run(plugin.game_release(900))

    # A system Vistazo has no folder for, and a full disk.
    romm.roms[10] = rom(10, "Game.bin", slug="atari2600")
    run(plugin.game_take(1000, 10))
    run(plugin.game_download(1000))
    check("unknown system", wait(1000)["job"]["state"], "system")
    run(plugin.game_release(1000))
    usage = shutil.disk_usage
    main.shutil.disk_usage = lambda p: types.SimpleNamespace(free=1000)
    run(plugin.game_take(500, 5))
    run(plugin.game_download(500))
    check("no room", wait(500)["job"]["state"], "space")
    main.shutil.disk_usage = usage
    check("no room leaves nothing", (os.path.exists(target), leftovers()), (False, []))

    # The key refused half way through: forgotten, and the page is told.
    romm.refuse.add(5)
    run(plugin.game_download(500))
    check("refused", wait(500)["job"]["state"], "refused")
    check("refused key forgotten", run(plugin.romm_status()), "unlinked")
    romm.refuse.clear()
    romm.codes["ABCDEFGH"] = (6, GAMES)
    check("paired again", pair("ABCDEFGH", True)["result"], "ok")
    run(plugin.game_release(500))


def archive(members):
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w") as z:
        for name, data in members:
            z.writestr(name, data)
    return raw.getvalue()


def test_archive():
    os.makedirs(os.path.join(ROMS, "ps2"), exist_ok=True)
    files = [("Disc 1.iso", 4000), ("Disc 2.iso", 6000)]
    romm.roms[11] = rom(11, "Two Discs", files=files, slug="ps2")
    romm.content[11] = archive([("Disc 1.iso", b"a" * 4000), ("Disc 2.iso", b"b" * 6000), ("Two Discs.m3u", b"Disc 1.iso\nDisc 2.iso\n")])
    run(plugin.game_take(1100, 11))
    run(plugin.game_download(1100))
    state = wait(1100)
    folder = os.path.join(ROMS, "ps2", "Two Discs")
    check("archive unpacked", (state["job"]["state"], sorted(os.listdir(folder))), ("installed", ["Disc 1.iso", "Disc 2.iso", "Two Discs.m3u"]))
    with open(main.LAUNCH_FILE) as f:
        check("starts from the playlist", json.load(f), {"11": os.path.join(folder, "Two Discs.m3u")})
    check("archive itself gone", [n for n in os.listdir(os.path.join(ROMS, "ps2")) if n != "Two Discs"], [])
    stray = os.path.join(folder, "notes.txt")
    open(stray, "wb").close()
    run(plugin.game_remove(1100))
    check("only Vistazo's files removed", os.listdir(folder), ["notes.txt"])
    os.remove(stray)
    os.rmdir(folder)

    # Members that would land outside are refused, and nothing of the archive stays.
    for bad in ("../escape.iso", "/abs.iso", "a/../../escape.iso"):
        romm.content[11] = archive([("Disc 1.iso", b"a" * 10), (bad, b"x")])
        run(plugin.game_download(1100))
        check("bad member %s" % bad, wait(1100)["job"]["state"], "archive")
        check("nothing kept", os.listdir(os.path.join(ROMS, "ps2")), [])
    check("nothing escaped", [n for n in os.listdir(ROMS) + os.listdir(os.path.dirname(ROMS)) if "escape" in n], [])
    romm.content[11] = b"not an archive"
    run(plugin.game_download(1100))
    check("not an archive", wait(1100)["job"]["state"], "archive")
    check("nothing kept", os.listdir(os.path.join(ROMS, "ps2")), [])
    run(plugin.game_release(1100))


try:
    test_key()
    test_detail()
    test_cover()
    test_launcher()
    test_download()
    test_archive()
    print("ok: %d checks" % checks)
finally:
    server.shutdown()
    other.shutdown()
    shutil.rmtree(TMP, ignore_errors=True)
