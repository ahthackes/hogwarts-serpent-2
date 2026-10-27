#!/usr/bin/env python3
# Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE.
"""
Hogwarts Serpent - secure multi-user game server.

Stdlib + Flask for PythonAnywhere WSGI compatibility.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import mimetypes
import os
import random
import re
import secrets
import sqlite3
import threading
import time
import urllib.parse
from collections import deque
from pathlib import Path
from flask import Flask, request, Response, send_from_directory

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("HPS_DATA", str(ROOT / "data"))).resolve()
DB_PATH = DATA_DIR / "game.db"
HOST = os.environ.get("HPS_HOST", "127.0.0.1")
PORT = int(os.environ.get("HPS_PORT", "8123"))
SECURE_COOKIE = os.environ.get("HPS_SECURE_COOKIE", "0") == "1"
TRUST_PROXY = os.environ.get("HPS_TRUST_PROXY", "0") == "1"
COOKIE_NAME = "hps_session"
SESSION_TTL = 7 * 24 * 60 * 60
PBKDF2_ITERATIONS = 600_000
MAX_BODY = 512 * 1024
LEVEL_COUNT = 24
ADMIN_USERNAME = os.environ.get("HPS_ADMIN_USER", "aht")
# The admin password is never stored in plain text. A brand-new database gets the
# maintainer's built-in credential below (a salted, one-way PBKDF2 hash), or your own
# password if you set HPS_ADMIN_PASSWORD before the first start. Existing accounts
# keep their current password.
ADMIN_PASSWORD = os.environ.get("HPS_ADMIN_PASSWORD", "")
DEFAULT_ADMIN_HASH = "pbkdf2_sha256$1000000$JhHVGBiqDbyizGDC6ZzsHg==$3PFgyI+e4cLO1sMSy6conoH2jOtaaQ229E2U/n5MtuM="
ADMIN_COINS = 2_000_000
CHAT_ROOM_COST = 1000
CHAT_MAX_MEMBERS = 30
CHAT_KEEP_MESSAGES = 2000
COIN_MODES = {"hell"}          # only these modes pay coins
AWARD_CAPS = {"level": 1500, "endless": 5000}

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,20}$")
RESERVED_USERNAMES = {"admin", "administrator", "system", "moderator", "server", "root"}

# --------------------------------------------------------------------------
# Skin catalog (stored in the database; skins.json only seeds a new database).
# --------------------------------------------------------------------------
SKIN_ID_RE = re.compile(r"^[a-z0-9_]{2,32}$")
SKIN_KINDS = {"snake", "board"}
SKIN_SOURCES = {"shop", "grant", "rank"}
EFFECTS = {"", "invincible", "attacker", "luck"}
HATS = {"wizard", "crown", "horns", "hood", "tophat", "none"}
EYES = {"round", "slit", "glow"}
WALL_STYLES = {"wood", "metal", "stone", "hedge", "marble"}
COLOR_RE = re.compile(r"^(#[0-9a-fA-F]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$")
DEFAULT_SKIN = "classic"
RANK_SKINS = {1: "crown_of_fortune", 2: "silver_phantom", 3: "bronze_ember"}  # Hell board top 3
HOUSES = {"gryffindor", "slytherin", "ravenclaw", "hufflepuff"}
DIFFICULTIES = {"easy", "difficult", "hell"}

_catalog_cache = {"at": 0.0, "map": {}}


def _skin_row_to_dict(row) -> dict:
    try:
        data = json.loads(row["data_json"] or "{}")
    except Exception:
        data = {}
    out = dict(data) if isinstance(data, dict) else {}
    out.update({
        "id": row["id"], "name": row["name"], "kind": row["kind"], "rarity": row["rarity"],
        "price": int(row["price"]), "desc": row["description"], "source": row["source"],
        "effect": row["effect"] or "", "active": bool(row["active"]),
        "admin_only": row["source"] != "shop",
    })
    return out


def catalog(force: bool = False) -> dict:
    now = time.time()
    if not force and _catalog_cache["map"] and now - _catalog_cache["at"] < 3:
        return _catalog_cache["map"]
    with _db_lock:
        rows = get_db().execute("SELECT * FROM skins ORDER BY sort_order, rowid").fetchall()
        mapping = {r["id"]: _skin_row_to_dict(r) for r in rows}
    _catalog_cache["at"] = now
    _catalog_cache["map"] = mapping
    return mapping


def default_save() -> dict:
    return {
        "house": "gryffindor",
        "progress": {},
        "best": {},
        "endlessBest": 0,
        "settings": {
            "sound": True,
            "music": True,
            "reducedMotion": False,
            "grid": False,
            "difficulty": "easy",
        },
        "seenHowto": False,
        "skins": [DEFAULT_SKIN],
        "equippedSkin": DEFAULT_SKIN,
        "equippedBoard": "",
    }


def admin_save() -> dict:
    save = default_save()
    save["progress"] = {str(i): 3 for i in range(1, LEVEL_COUNT + 1)}
    save["best"] = {str(i): 1200 + i * 150 for i in range(1, LEVEL_COUNT + 1)}
    save["endlessBest"] = 100000
    save["seenHowto"] = True
    cat = catalog()
    save["skins"] = sorted(cat)
    save["equippedSkin"] = "headmaster" if "headmaster" in cat else DEFAULT_SKIN
    return save


def normalize_save(raw: dict, current: dict | None = None) -> dict:
    out = default_save()
    if isinstance(raw, dict):
        house = raw.get("house")
        if house in HOUSES:
            out["house"] = house

        progress = {}
        raw_progress = raw.get("progress", {})
        if isinstance(raw_progress, dict):
            for k, v in raw_progress.items():
                try:
                    lid, stars = int(k), int(v)
                except (TypeError, ValueError):
                    continue
                if 1 <= lid <= LEVEL_COUNT and 0 <= stars <= 3:
                    progress[str(lid)] = stars
        out["progress"] = progress

        best = {}
        raw_best = raw.get("best", {})
        if isinstance(raw_best, dict):
            for k, v in raw_best.items():
                try:
                    lid, score = int(k), int(v)
                except (TypeError, ValueError):
                    continue
                if 1 <= lid <= LEVEL_COUNT and 0 <= score <= 1_000_000_000:
                    best[str(lid)] = score
        out["best"] = best

        try:
            out["endlessBest"] = max(0, min(1_000_000_000, int(raw.get("endlessBest", 0))))
        except (TypeError, ValueError):
            out["endlessBest"] = 0

        settings = raw.get("settings", {})
        if isinstance(settings, dict):
            for key in ("sound", "music", "reducedMotion", "grid"):
                if isinstance(settings.get(key), bool):
                    out["settings"][key] = settings[key]
            difficulty = settings.get("difficulty")
            if difficulty in DIFFICULTIES:
                out["settings"]["difficulty"] = difficulty
        out["seenHowto"] = bool(raw.get("seenHowto", False))

    if current:
        cat = catalog()
        owned = [sid for sid in current.get("skins", []) if sid in cat]
        if DEFAULT_SKIN not in owned:
            owned.append(DEFAULT_SKIN)
        out["skins"] = owned
        eq = current.get("equippedSkin")
        out["equippedSkin"] = eq if (eq in owned and cat.get(eq, {}).get("kind") == "snake") else DEFAULT_SKIN
        eb = current.get("equippedBoard", "")
        out["equippedBoard"] = eb if (eb in owned and cat.get(eb, {}).get("kind") == "board") else ""
    else:
        out["skins"] = [DEFAULT_SKIN]
        out["equippedSkin"] = DEFAULT_SKIN
        out["equippedBoard"] = ""
    return out


def save_from_row(row) -> dict:
    try:
        parsed = json.loads(row["save_json"])
    except Exception:
        parsed = default_save()
    return normalize_save(parsed, parsed if isinstance(parsed, dict) else None)


def stats_from_save(save: dict) -> dict:
    progress = save.get("progress", {})
    stars = sum(int(v) for v in progress.values() if isinstance(v, int) or str(v).isdigit())
    completed = sum(1 for v in progress.values() if str(v).isdigit() and int(v) > 0)
    return {
        "stars": stars,
        "max_stars": LEVEL_COUNT * 3,
        "levels_completed": completed,
        "levels_total": LEVEL_COUNT,
        "skins": len(save.get("skins", [])),
        "skins_total": len(catalog()),
    }


# --------------------------------------------------------------------------
# Password hashing / sessions
# --------------------------------------------------------------------------
def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _unb64(data: str) -> bytes:
    return base64.b64decode(data.encode("ascii"), validate=True)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations)
        if iterations < 100_000 or iterations > 2_000_000:
            return False
        salt = _unb64(salt_b64)
        expected = _unb64(digest_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


DUMMY_HASH = hash_password("not-a-real-password-7f3a9c")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------
# Rate limiting
# --------------------------------------------------------------------------
_rate_lock = threading.Lock()
_rate_buckets: dict[tuple[str, str], deque] = {}


def rate_allow(scope: str, key: str, limit: int, window: int) -> bool:
    now = time.time()
    with _rate_lock:
        bucket = _rate_buckets.setdefault((scope, key), deque())
        while bucket and bucket[0] <= now - window:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        if len(_rate_buckets) > 5000:
            for k in list(_rate_buckets):
                b = _rate_buckets[k]
                if not b or b[-1] <= now - 3600:
                    _rate_buckets.pop(k, None)
        return True


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
_db = None
_db_lock = threading.RLock()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def get_db() -> sqlite3.Connection:
    global _db
    with _db_lock:
        if _db is not None:
            return _db
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA foreign_keys=ON")
        con.execute("PRAGMA busy_timeout=5000")
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                username_lower TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                coins INTEGER NOT NULL DEFAULT 0,
                save_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_login INTEGER
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                csrf TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                last_seen INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
            CREATE TABLE IF NOT EXISTS coin_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                delta INTEGER NOT NULL,
                reason TEXT NOT NULL,
                actor_id INTEGER,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_coin_log_user ON coin_log(user_id, created_at);
            """
        )
        con.commit()
        _db = con
        _migrate(con)
        _seed_catalog(con)
        _seed_admin(con)
        return con


def _seed_admin(con: sqlite3.Connection) -> None:
    now = int(time.time())
    row = con.execute(
        "SELECT * FROM users WHERE username_lower = ?", (ADMIN_USERNAME.lower(),)
    ).fetchone()
    if row is None:
        save = admin_save()
        con.execute(
            """INSERT INTO users
               (username, username_lower, password_hash, is_admin, coins, save_json, created_at, last_login)
               VALUES (?, ?, ?, 1, ?, ?, ?, NULL)""",
            (
                ADMIN_USERNAME,
                ADMIN_USERNAME.lower(),
                _initial_admin_hash(),
                ADMIN_COINS,
                json.dumps(save, separators=(",", ":")),
                now,
            ),
        )
        con.commit()
        return

    save = save_from_row(row)
    changed = False
    for i in range(1, LEVEL_COUNT + 1):
        if save["progress"].get(str(i), 0) < 3:
            save["progress"][str(i)] = 3
            changed = True
        if save["best"].get(str(i), 0) < 1200 + i * 150:
            save["best"][str(i)] = 1200 + i * 150
            changed = True
    owned = set(save.get("skins", []))
    for sid in catalog(True):
        if sid not in owned:
            owned.add(sid)
            changed = True
    if save.get("equippedSkin") not in owned:
        save["equippedSkin"] = "headmaster" if "headmaster" in owned else DEFAULT_SKIN
        changed = True
    save["skins"] = sorted(owned)
    if changed or not row["is_admin"]:
        con.execute(
            "UPDATE users SET is_admin = 1, save_json = ? WHERE id = ?",
            (json.dumps(save, separators=(",", ":")), row["id"]),
        )
        con.commit()


def user_public(row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "is_admin": bool(row["is_admin"]),
        "coins": int(row["coins"]),
        "must_change": bool(row["must_change"]),
    }


def get_user_by_id(con: sqlite3.Connection, uid: int):
    return con.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()


def get_user_by_name(con: sqlite3.Connection, username: str):
    return con.execute(
        "SELECT * FROM users WHERE username_lower = ?", (username.strip().lower(),)
    ).fetchone()


def update_save(con: sqlite3.Connection, uid: int, save: dict) -> None:
    con.execute(
        "UPDATE users SET save_json = ? WHERE id = ?",
        (json.dumps(save, separators=(",", ":")), uid),
    )


# ==========================================================================
# Database migrations, seeds and shared helpers
# ==========================================================================
def _migrate(con: sqlite3.Connection) -> None:
    cols = {r["name"] for r in con.execute("PRAGMA table_info(users)").fetchall()}
    if "must_change" not in cols:
        con.execute("ALTER TABLE users ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0")
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS skins (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'snake',
            rarity TEXT NOT NULL DEFAULT 'common',
            price INTEGER NOT NULL DEFAULT 0,
            description TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'shop',
            effect TEXT NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1,
            data_json TEXT NOT NULL DEFAULT '{}',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS admin_grants (
            user_id INTEGER NOT NULL, skin_id TEXT NOT NULL, PRIMARY KEY (user_id, skin_id)
        );
        CREATE TABLE IF NOT EXISTS rank_holders (skin_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind TEXT NOT NULL, text TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL, read_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, id);
        CREATE TABLE IF NOT EXISTS runs (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind TEXT NOT NULL, mode TEXT NOT NULL, level_id INTEGER NOT NULL DEFAULT 0,
            effect TEXT NOT NULL DEFAULT '', started_at INTEGER NOT NULL, finished INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS scores (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            mode TEXT NOT NULL, best_score INTEGER NOT NULL DEFAULT 0, best_wave INTEGER NOT NULL DEFAULT 0,
            effect TEXT NOT NULL DEFAULT '', runs INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, mode)
        );
        CREATE INDEX IF NOT EXISTS idx_scores_mode ON scores(mode, best_score DESC);
        CREATE TABLE IF NOT EXISTS password_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            username TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
            created_at INTEGER NOT NULL, handled_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS chat_rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            owner_id INTEGER NOT NULL, created_at INTEGER NOT NULL, closed INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS chat_members (
            room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            joined_at INTEGER NOT NULL, left_at INTEGER, last_read INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (room_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
            user_id INTEGER, body TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'msg', created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chat_msg_room ON chat_messages(room_id, id);
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            p1 INTEGER NOT NULL, p2 INTEGER NOT NULL, status TEXT NOT NULL,
            created_at INTEGER NOT NULL, start_at REAL, finished_at INTEGER,
            winner INTEGER, state_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_matches_p ON matches(p1, p2, status);
        """
    )
    con.commit()


def _snake_data(base, light, dark, eye, main, deep, accent, letter, hat="wizard", eyes="round", glow="rgba(255,255,255,.2)", glasses=False):
    return {
        "snake": {"base": base, "light": light, "dark": dark, "scale": "rgba(0,0,0,.34)", "eye": eye},
        "robe": {"main": main, "deep": deep, "accent": accent, "letter": letter},
        "hat": hat, "eyes": eyes, "glasses": glasses, "glow": glow,
    }


def _board_data(floor_a, floor_b, wall, wall_top, wall_dark, accent, style, tint):
    return {"board": {"floorA": floor_a, "floorB": floor_b, "wall": wall, "wallTop": wall_top,
                      "wallDark": wall_dark, "accent": accent, "wallStyle": style, "tint": tint}}


BUILTIN_SKINS = [
    # id, name, kind, rarity, price, description, source, effect, data
    ("aegis_serpent", "Aegis Serpent", "snake", "legendary", 0,
     "Ward-forged scales. Shrugs off one fatal hit, then recharges every 30 seconds.", "grant", "invincible",
     _snake_data("#2e6fbf", "#9cd0ff", "#0d2a52", "#ffffff", "#1d4f9c", "#0a2250", "#cfe6ff", "A", "wizard", "glow", "rgba(120,190,255,.38)")),
    ("venom_striker", "Venom Striker", "snake", "legendary", 0,
     "Press Space to release a venom pulse that stuns nearby guardians. Cooldown 10 seconds.", "grant", "attacker",
     _snake_data("#6b2fa0", "#c58cff", "#220a3a", "#9dff4a", "#4b1a7a", "#1c0833", "#9dff4a", "V", "horns", "slit", "rgba(157,255,74,.3)")),
    ("crown_of_fortune", "Crown of Fortune", "snake", "mythic", 0,
     "Champion reward for Hell rank 1. Luck: every Hell coin you earn is doubled.", "rank", "luck",
     _snake_data("#c9a227", "#fff0a0", "#5a4208", "#2bd96b", "#a67c1d", "#4f3906", "#fff0a0", "L", "crown", "glow", "rgba(255,225,110,.4)")),
    ("silver_phantom", "Silver Phantom", "snake", "mythic", 0,
     "Champion reward for Hell rank 2. A ghost-silver serpent.", "rank", "",
     _snake_data("#b8c4d6", "#f0f4fa", "#4a5568", "#6ae0ff", "#7e8aa0", "#2d3648", "#e8eef8", "S", "hood", "glow", "rgba(190,215,255,.35)")),
    ("bronze_ember", "Bronze Ember", "snake", "mythic", 0,
     "Champion reward for Hell rank 3. Scales still warm from the forge.", "rank", "",
     _snake_data("#b5651d", "#f0a868", "#4a2208", "#ffdd55", "#8c4a14", "#3a1b05", "#ffb870", "B", "horns", "slit", "rgba(255,150,60,.35)")),
    ("board_emerald", "Emerald Crypt", "board", "common", 1500, "A cold green crypt floor with mossy stone walls.", "shop", "",
     _board_data("#0f2a22", "#05110d", "#1d4a3a", "#2f7a5f", "#0b2219", "#6cf2a8", "stone", "rgba(80,240,150,.06)")),
    ("board_royal", "Royal Court", "board", "rare", 2500, "Violet marble and a throne-room glow.", "shop", "",
     _board_data("#2a1a3a", "#120a1c", "#4a2f6b", "#7a55a8", "#1e1230", "#e0b8ff", "marble", "rgba(190,120,255,.06)")),
    ("board_ember", "Ember Forge", "board", "rare", 4000, "Blackened iron and glowing coals.", "shop", "",
     _board_data("#331408", "#130602", "#5a2410", "#9a4a22", "#2a0e05", "#ffa24a", "metal", "rgba(255,120,40,.07)")),
    ("board_frost", "Frozen Lake", "board", "epic", 6000, "Ice-blue floor and glittering frost walls.", "shop", "",
     _board_data("#12304a", "#07121f", "#3b6f8f", "#8fd0ee", "#173347", "#bdf0ff", "stone", "rgba(140,210,255,.07)")),
    ("board_gold", "Gringotts Vault", "board", "epic", 9000, "Gold-veined marble from the deepest vault.", "shop", "",
     _board_data("#332a12", "#130f05", "#7a6420", "#d8b24a", "#3c2f0c", "#ffe27a", "marble", "rgba(255,215,110,.07)")),
    ("board_void", "Void Observatory", "board", "legendary", 14000, "Black glass walls under a violet void.", "shop", "",
     _board_data("#0a0a1a", "#020208", "#1d1d44", "#4a4aa8", "#0a0a22", "#9a9aff", "metal", "rgba(120,120,255,.07)")),
]


def _seed_catalog(con: sqlite3.Connection) -> None:
    now = int(time.time())
    order = 0
    try:
        with open(ROOT / "skins.json", "r", encoding="utf-8") as fh:
            legacy = json.load(fh)
    except Exception:
        legacy = []
    for item in legacy if isinstance(legacy, list) else []:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("id", "")).strip()
        if not SKIN_ID_RE.match(sid):
            continue
        order += 1
        data = {k: item[k] for k in ("snake", "robe", "hat", "eyes", "glasses", "glow") if k in item}
        con.execute(
            """INSERT OR IGNORE INTO skins (id, name, kind, rarity, price, description, source, effect, active, data_json, sort_order, created_at)
               VALUES (?, ?, 'snake', ?, ?, ?, ?, '', 1, ?, ?, ?)""",
            (sid, str(item.get("name", sid))[:80], str(item.get("rarity", "common"))[:24],
             max(0, int(item.get("price", 0) or 0)), str(item.get("desc", ""))[:240],
             "grant" if item.get("admin_only") else "shop", json.dumps(data, separators=(",", ":")), order, now),
        )
    for sid, name, kind, rarity, price, desc, source, effect, data in BUILTIN_SKINS:
        order += 1
        con.execute(
            """INSERT OR IGNORE INTO skins (id, name, kind, rarity, price, description, source, effect, active, data_json, sort_order, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)""",
            (sid, name, kind, rarity, price, desc, source, effect, json.dumps(data, separators=(",", ":")), 1000 + order, now),
        )
    con.commit()
    catalog(True)


def _initial_admin_hash() -> str:
    """Password hash for the admin account of a brand-new database."""
    return hash_password(ADMIN_PASSWORD) if ADMIN_PASSWORD else DEFAULT_ADMIN_HASH


def client_ip() -> str:
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()[:64] or "?"
    return (request.remote_addr or "?")[:64]








def notify(con, uid: int, kind: str, text: str, data=None) -> None:
    con.execute(
        "INSERT INTO notifications (user_id, kind, text, data_json, created_at) VALUES (?, ?, ?, ?, ?)",
        (uid, kind, text[:240], json.dumps(data or {}), int(time.time())),
    )


def notify_admins(con, kind: str, text: str, data=None) -> None:
    for r in con.execute("SELECT id FROM users WHERE is_admin = 1").fetchall():
        notify(con, r["id"], kind, text, data)


def grant_skin(con, uid: int, skin_id: str, by_admin: bool = False) -> None:
    row = get_user_by_id(con, uid)
    if row is None:
        return
    save = save_from_row(row)
    if skin_id not in save["skins"]:
        save["skins"] = sorted(set(save["skins"]) | {skin_id})
        update_save(con, uid, save)
    if by_admin:
        con.execute("INSERT OR IGNORE INTO admin_grants (user_id, skin_id) VALUES (?, ?)", (uid, skin_id))


def revoke_skin(con, uid: int, skin_id: str, force: bool = False) -> bool:
    """Remove a skin. Without force, skins the admin granted are kept."""
    if not force and con.execute("SELECT 1 FROM admin_grants WHERE user_id = ? AND skin_id = ?", (uid, skin_id)).fetchone():
        return False
    if force:
        con.execute("DELETE FROM admin_grants WHERE user_id = ? AND skin_id = ?", (uid, skin_id))
    row = get_user_by_id(con, uid)
    if row is None:
        return False
    save = save_from_row(row)
    if skin_id in save["skins"]:
        save["skins"] = [x for x in save["skins"] if x != skin_id]
        if save["equippedSkin"] == skin_id:
            save["equippedSkin"] = DEFAULT_SKIN
        if save["equippedBoard"] == skin_id:
            save["equippedBoard"] = ""
        update_save(con, uid, save)
        return True
    return False


# --------------------------------------------------------------------------
# Flask Web Server Layer (PythonAnywhere WSGI Compatible)
# --------------------------------------------------------------------------
app = Flask(__name__, static_folder=None)

def create_session(uid: int, resp: Response) -> str:
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    now = int(time.time())
    with _db_lock:
        con = get_db()
        con.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        con.execute(
            """INSERT INTO sessions (user_id, token_hash, csrf, created_at, expires_at, last_seen)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (uid, hash_token(token), csrf, now, now + SESSION_TTL, now),
        )
        con.commit()
    resp.set_cookie(COOKIE_NAME, token, max_age=SESSION_TTL, httponly=True, samesite='Strict', secure=SECURE_COOKIE)
    return csrf


def require_session(csrf: bool = True):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise ApiError(401, "Please sign in.")
    now = int(time.time())
    with _db_lock:
        con = get_db()
        session = con.execute(
            """SELECT s.id AS session_id, s.user_id AS session_user_id,
                      s.csrf AS session_csrf, s.expires_at AS session_expires,
                      s.last_seen AS session_last_seen, u.*
               FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = ? AND s.expires_at > ?""",
            (hash_token(token), now),
        ).fetchone()
        if session is None:
            raise ApiError(401, "Session expired. Please sign in again.")
        if csrf and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            supplied = request.headers.get("X-CSRF-Token", "")
            if not supplied or not hmac.compare_digest(supplied, session["session_csrf"]):
                raise ApiError(403, "Invalid security token. Refresh and try again.")
        user = get_user_by_id(con, session["session_user_id"])
    if user is None:
        raise ApiError(401, "Account not found.")
    if user["must_change"]:
        allowed = {"/api/password", "/api/logout", "/api/me"}
        if request.path not in allowed and not (request.path == "/api/save" and request.method == "GET"):
            raise ApiError(403, "Choose a new password first.")
    return user, session


@app.errorhandler(ApiError)
def handle_api_error(exc):
    return json.dumps({"error": exc.message}), exc.status, {"Content-Type": "application/json"}


@app.route('/api/health', methods=['GET'])
def api_health():
    return json.dumps({"ok": True, "service": "hogwarts-serpent", "build": "social-7", "secure_cookie": SECURE_COOKIE, "time": int(time.time())}), 200, {"Content-Type": "application/json"}


@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json(force=True, silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    if not rate_allow("register-ip", client_ip(), 10, 3600):
        raise ApiError(429, "Too many accounts created from this connection. Try again later.")
    if not USERNAME_RE.match(username):
        raise ApiError(400, "Username must be 3-20 letters, numbers or underscores.")
    if username.lower() in RESERVED_USERNAMES:
        raise ApiError(400, "That username is reserved.")
    if not (6 <= len(password) <= 128):
        raise ApiError(400, "Password must be between 6 and 128 characters.")

    now = int(time.time())
    save = default_save()
    with _db_lock:
        con = get_db()
        if con.execute("SELECT 1 FROM users WHERE username_lower = ?", (username.lower(),)).fetchone():
            raise ApiError(409, "Username already taken.")
        try:
            con.execute("BEGIN IMMEDIATE")
            cur = con.execute(
                """INSERT INTO users
                   (username, username_lower, password_hash, is_admin, coins, save_json, created_at, last_login)
                   VALUES (?, ?, ?, 0, 0, ?, ?, ?)""",
                (username, username.lower(), hash_password(password), json.dumps(save, separators=(",", ":")), now, now),
            )
            uid = int(cur.lastrowid)
            con.commit()
        except sqlite3.IntegrityError:
            con.rollback()
            raise ApiError(409, "Username already taken.")
        user = get_user_by_id(con, uid)

    resp = Response(json.dumps({"user": user_public(user), "save": save_from_row(user)}), status=201, mimetype='application/json')
    csrf = create_session(uid, resp)
    body = json.loads(resp.get_data(as_text=True))
    body["csrf"] = csrf
    resp.set_data(json.dumps(body))
    return resp


@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json(force=True, silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    if not username or len(username) > 80 or not password or len(password) > 200:
        raise ApiError(401, "Invalid username or password.")
    if not rate_allow("login-ip", client_ip(), 60, 300) or not rate_allow("login-user", username.lower(), 10, 300):
        raise ApiError(429, "Too many sign-in attempts. Wait a few minutes and try again.")

    with _db_lock:
        con = get_db()
        user = get_user_by_name(con, username)
        stored = user["password_hash"] if user else DUMMY_HASH
        valid = verify_password(password, stored)
        if not user or not valid:
            raise ApiError(401, "Invalid username or password.")
        con.execute("UPDATE users SET last_login = ? WHERE id = ?", (int(time.time()), user["id"]))
        con.commit()
        user = get_user_by_id(con, user["id"])

    resp = Response(json.dumps({"user": user_public(user), "save": save_from_row(user)}), status=200, mimetype='application/json')
    csrf = create_session(user["id"], resp)
    body = json.loads(resp.get_data(as_text=True))
    body["csrf"] = csrf
    resp.set_data(json.dumps(body))
    return resp


@app.route('/api/logout', methods=['POST'])
def api_logout():
    token = request.cookies.get(COOKIE_NAME)
    if token:
        with _db_lock:
            con = get_db()
            con.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
            con.commit()
    resp = Response(json.dumps({"ok": True}), status=200, mimetype='application/json')
    # The delete cookie must carry the same attributes the login cookie was set
    # with (path/secure/samesite), otherwise some browsers keep the old cookie
    # and the next page load silently signs the user back in.
    resp.delete_cookie(COOKIE_NAME, path='/', secure=SECURE_COOKIE, httponly=True, samesite='Strict')
    return resp


@app.after_request
def no_store_for_api(resp):
    # Never let a browser/proxy cache auth state (/api/me, /api/logout, ...).
    if request.path.startswith('/api/'):
        resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.route('/api/me', methods=['GET'])
def api_me():
    user, session = require_session(csrf=False)
    return json.dumps({"user": user_public(user), "csrf": session["session_csrf"]}), 200, {"Content-Type": "application/json"}


@app.route('/api/save', methods=['GET', 'POST'])
def api_save():
    user, _ = require_session(csrf=(request.method == 'POST'))
    if request.method == 'POST':
        data = request.get_json(force=True, silent=True) or {}
        raw = data.get("save", {})
        if not isinstance(raw, dict):
            raise ApiError(400, "Invalid save data.")
        current = save_from_row(user)
        save = normalize_save(raw, current)
        with _db_lock:
            con = get_db()
            update_save(con, user["id"], save)
            con.commit()
            user = get_user_by_id(con, user["id"])
    return json.dumps({"user": user_public(user), "save": save_from_row(user)}), 200, {"Content-Type": "application/json"}


@app.route('/api/shop/buy', methods=['POST'])
def api_shop_buy():
    user, _ = require_session()
    data = request.get_json(force=True, silent=True) or {}
    skin_id = str(data.get("skin_id", "")).strip()
    cat = catalog()
    skin = cat.get(skin_id)
    if skin is None:
        raise ApiError(404, "Unknown skin.")
    with _db_lock:
        con = get_db()
        try:
            con.execute("BEGIN IMMEDIATE")
            row = get_user_by_id(con, user["id"])
            if row is None:
                raise ApiError(401, "Account not found.")
            save = save_from_row(row)
            if skin_id in save["skins"]:
                raise ApiError(409, "You already own that skin.")
            if skin["source"] != "shop" and not row["is_admin"]:
                raise ApiError(403, "That skin cannot be bought. It is granted by the admin or won on the leaderboard.")
            if not skin["active"] and not row["is_admin"]:
                raise ApiError(403, "That skin is no longer sold.")
            price = int(skin["price"])
            if int(row["coins"]) < price:
                raise ApiError(400, "Not enough coins.")
            save["skins"] = sorted(set(save["skins"]) | {skin_id})
            con.execute("UPDATE users SET coins = coins - ? WHERE id = ?", (price, row["id"]))
            update_save(con, row["id"], save)
            _log_coins(con, row["id"], -price, "shop:" + skin_id, row["id"])
            con.commit()
        except Exception:
            con.rollback()
            raise
        row = get_user_by_id(con, user["id"])
    return _json({"user": user_public(row), "save": save_from_row(row)})


@app.route('/api/shop/equip', methods=['POST'])
def api_shop_equip():
    user, _ = require_session()
    data = request.get_json(force=True, silent=True) or {}
    skin_id = str(data.get("skin_id", "")).strip()
    kind = str(data.get("kind", "")).strip()
    cat = catalog()
    if skin_id == "" and kind == "board":
        skin = None
    else:
        skin = cat.get(skin_id)
        if skin is None:
            raise ApiError(404, "Unknown skin.")
    with _db_lock:
        con = get_db()
        try:
            con.execute("BEGIN IMMEDIATE")
            row = get_user_by_id(con, user["id"])
            if row is None:
                raise ApiError(401, "Account not found.")
            save = save_from_row(row)
            if skin is None:
                save["equippedBoard"] = ""
            else:
                if skin_id not in save["skins"]:
                    raise ApiError(403, "You do not own that skin.")
                if skin["kind"] == "board":
                    save["equippedBoard"] = skin_id
                else:
                    save["equippedSkin"] = skin_id
            update_save(con, row["id"], save)
            con.commit()
        except Exception:
            con.rollback()
            raise
        row = get_user_by_id(con, user["id"])
    return _json({"user": user_public(row), "save": save_from_row(row)})


def _json(payload: dict, status: int = 200):
    return json.dumps(payload), status, {"Content-Type": "application/json"}


def _int_field(data: dict, key: str, lo: int, hi: int, label: str) -> int:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) != value:
        raise ApiError(400, label + " must be a whole number.")
    value = int(value)
    if not (lo <= value <= hi):
        raise ApiError(400, label + " must be between %d and %d." % (lo, hi))
    return value


def _log_coins(con, uid: int, delta: int, reason: str, actor: int | None) -> None:
    con.execute(
        "INSERT INTO coin_log (user_id, delta, reason, actor_id, created_at) VALUES (?, ?, ?, ?, ?)",
        (uid, delta, reason[:120], actor, int(time.time())),
    )


# ---- coins -----------------------------------------------------------------
@app.route('/api/coins/share', methods=['POST'])
def api_coins_share():
    user, _ = require_session()
    if not rate_allow("share", str(user["id"]), 20, 3600):
        raise ApiError(429, "Too many transfers. Try again later.")
    data = request.get_json(force=True, silent=True) or {}
    to_name = str(data.get("to", "")).strip()
    amount = _int_field(data, "amount", 1, 1_000_000_000, "Amount")
    if not to_name:
        raise ApiError(400, "Enter a recipient username.")
    with _db_lock:
        con = get_db()
        try:
            con.execute("BEGIN IMMEDIATE")
            target = get_user_by_name(con, to_name)
            if target is None:
                raise ApiError(404, "No player with that username.")
            if target["id"] == user["id"]:
                raise ApiError(400, "You cannot send coins to yourself.")
            sender = get_user_by_id(con, user["id"])
            if int(sender["coins"]) < amount:
                raise ApiError(400, "Not enough coins.")
            con.execute("UPDATE users SET coins = coins - ? WHERE id = ?", (amount, sender["id"]))
            con.execute("UPDATE users SET coins = coins + ? WHERE id = ?", (amount, target["id"]))
            _log_coins(con, sender["id"], -amount, "sent to " + target["username"], sender["id"])
            _log_coins(con, target["id"], amount, "received from " + sender["username"], sender["id"])
            con.commit()
        except Exception:
            con.rollback()
            raise
        row = get_user_by_id(con, user["id"])
    return _json({"user": user_public(row), "save": save_from_row(row), "sent": amount, "to": target["username"]})


# ---- password --------------------------------------------------------------
@app.route('/api/password', methods=['POST'])
def api_password():
    user, session = require_session()
    if not rate_allow("password", str(user["id"]), 10, 900):
        raise ApiError(429, "Too many attempts. Try again later.")
    data = request.get_json(force=True, silent=True) or {}
    current = str(data.get("current_password", ""))
    new = str(data.get("new_password", ""))
    if not verify_password(current, user["password_hash"]):
        raise ApiError(403, "Current password is incorrect.")
    if not (6 <= len(new) <= 128):
        raise ApiError(400, "Password must be between 6 and 128 characters.")
    if new == current:
        raise ApiError(400, "New password must be different from the current one.")
    with _db_lock:
        con = get_db()
        con.execute("UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?", (hash_password(new), user["id"]))
        con.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))  # sign out every session
        con.commit()
        row = get_user_by_id(con, user["id"])
    resp = Response(json.dumps({"user": user_public(row), "save": save_from_row(row)}), status=200, mimetype='application/json')
    csrf = create_session(user["id"], resp)
    body = json.loads(resp.get_data(as_text=True))
    body["csrf"] = csrf
    resp.set_data(json.dumps(body))
    return resp


# ---- admin -----------------------------------------------------------------
def require_admin():
    user, session = require_session()
    if not user["is_admin"]:
        raise ApiError(403, "Administrator access required.")
    return user


@app.route('/api/admin/users', methods=['GET'])
def api_admin_users():
    require_admin()
    with _db_lock:
        rows = get_db().execute("SELECT * FROM users ORDER BY is_admin DESC, username_lower ASC").fetchall()
    users = []
    for row in rows:
        save = save_from_row(row)
        stats = stats_from_save(save)
        info = user_public(row)
        info.update({"stars": stats["stars"], "levels_completed": stats["levels_completed"],
                     "skins": stats["skins"], "last_login": row["last_login"]})
        users.append(info)
    return _json({"users": users})


@app.route('/api/admin/users/<username>', methods=['GET'])
def api_admin_user_detail(username):
    require_admin()
    with _db_lock:
        con = get_db()
        row = get_user_by_name(con, username)
        if row is None:
            raise ApiError(404, "No such user.")
        log = [dict(r) for r in con.execute(
            "SELECT delta, reason, created_at FROM coin_log WHERE user_id = ? ORDER BY id DESC LIMIT 20", (row["id"],)
        ).fetchall()]
    save = save_from_row(row)
    return _json({"user": user_public(row), "stats": stats_from_save(save), "save": save, "log": log})


@app.route('/api/admin/action', methods=['POST'])
def api_admin_action():
    admin = require_admin()
    data = request.get_json(force=True, silent=True) or {}
    action = str(data.get("action", ""))
    username = str(data.get("username", "")).strip()
    with _db_lock:
        con = get_db()
        try:
            con.execute("BEGIN IMMEDIATE")
            row = get_user_by_name(con, username)
            if row is None:
                raise ApiError(404, "No such user.")
            uid = row["id"]
            save = save_from_row(row)
            if action == "grant":
                amount = _int_field(data, "amount", 1, 10_000_000, "Amount")
                con.execute("UPDATE users SET coins = coins + ? WHERE id = ?", (amount, uid))
                _log_coins(con, uid, amount, "admin grant (%s)" % admin["username"], admin["id"])
            elif action == "set-coins":
                amount = _int_field(data, "amount", 0, 1_000_000_000, "Balance")
                delta = amount - int(row["coins"])
                con.execute("UPDATE users SET coins = ? WHERE id = ?", (amount, uid))
                _log_coins(con, uid, delta, "admin set balance (%s)" % admin["username"], admin["id"])
            elif action == "unlock-levels":
                save["progress"] = {str(i): 3 for i in range(1, LEVEL_COUNT + 1)}
                update_save(con, uid, save)
            elif action == "unlock-skins":
                save["skins"] = sorted(catalog())
                for sid in save["skins"]:
                    con.execute("INSERT OR IGNORE INTO admin_grants (user_id, skin_id) VALUES (?, ?)", (uid, sid))
                update_save(con, uid, save)
            elif action == "set-level":
                level_id = _int_field(data, "level_id", 1, LEVEL_COUNT, "Level")
                stars = _int_field(data, "stars", 0, 3, "Stars")
                if stars:
                    save["progress"][str(level_id)] = stars
                else:
                    save["progress"].pop(str(level_id), None)
                update_save(con, uid, save)
            elif action == "set-skin":
                skin_id = str(data.get("skin_id", ""))
                cat = catalog()
                if skin_id not in cat:
                    raise ApiError(404, "Unknown skin.")
                if data.get("owned") is True:
                    grant_skin(con, uid, skin_id, by_admin=True)
                    notify(con, uid, "skin", "The admin gave you the skin: " + cat[skin_id]["name"], {"skin": skin_id})
                else:
                    if skin_id == DEFAULT_SKIN:
                        raise ApiError(400, "The default skin cannot be locked.")
                    revoke_skin(con, uid, skin_id, force=True)
                row = get_user_by_id(con, uid)
                save = save_from_row(row)
            else:
                raise ApiError(400, "Unknown admin action.")
            con.commit()
        except Exception:
            con.rollback()
            raise
        row = get_user_by_id(con, uid)
    return _json({"user": user_public(row), "save": save_from_row(row)})


# ==========================================================================
# Skins, runs (anti-cheat tokens), leaderboards
# ==========================================================================
@app.route('/api/skins', methods=['GET'])
def api_skins():
    require_session(csrf=False)
    return _json({"skins": list(catalog().values())})


@app.route('/api/run/start', methods=['POST'])
def api_run_start():
    user, _ = require_session()
    if not rate_allow("run-start", str(user["id"]), 120, 600):
        raise ApiError(429, "Too many runs started. Slow down.")
    data = request.get_json(force=True, silent=True) or {}
    kind = str(data.get("kind", ""))
    mode = str(data.get("mode", ""))
    if kind not in ("level", "endless") or mode not in DIFFICULTIES:
        raise ApiError(400, "Invalid run.")
    if kind == "level" and mode == "hell":
        raise ApiError(400, "Hell mode is endless-only.")
    level_id = _int_field(data, "level_id", 1, LEVEL_COUNT, "Level") if kind == "level" else 0
    skin = catalog().get(save_from_row(user)["equippedSkin"]) or {}
    effect = skin.get("effect", "")
    token = secrets.token_urlsafe(18)
    now = int(time.time())
    with _db_lock:
        con = get_db()
        con.execute("DELETE FROM runs WHERE started_at < ?", (now - 6 * 3600,))
        con.execute(
            "INSERT INTO runs (token, user_id, kind, mode, level_id, effect, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (token, user["id"], kind, mode, level_id, effect, now),
        )
        con.commit()
    return _json({"run": token, "effect": effect, "mode": mode})


def rank_for(con, uid: int, mode: str):
    row = con.execute(
        "SELECT s.best_score, s.updated_at, u.is_admin FROM scores s JOIN users u ON u.id = s.user_id WHERE s.user_id = ? AND s.mode = ?",
        (uid, mode),
    ).fetchone()
    if not row or row["is_admin"] or row["best_score"] <= 0:
        return None
    better = con.execute(
        """SELECT COUNT(*) AS c FROM scores s JOIN users u ON u.id = s.user_id
           WHERE s.mode = ? AND u.is_admin = 0 AND (s.best_score > ? OR (s.best_score = ? AND s.updated_at < ?))""",
        (mode, row["best_score"], row["best_score"], row["updated_at"]),
    ).fetchone()["c"]
    return int(better) + 1


def sync_rank_skins(con) -> None:
    """Champion skins follow the current top 3 of the Hell board."""
    cat = catalog()
    top = con.execute(
        """SELECT s.user_id FROM scores s JOIN users u ON u.id = s.user_id
           WHERE s.mode = 'hell' AND u.is_admin = 0 AND s.best_score > 0
           ORDER BY s.best_score DESC, s.updated_at ASC LIMIT 3"""
    ).fetchall()
    for rank, skin_id in RANK_SKINS.items():
        if skin_id not in cat:
            continue
        new_uid = top[rank - 1]["user_id"] if len(top) >= rank else None
        old = con.execute("SELECT user_id FROM rank_holders WHERE skin_id = ?", (skin_id,)).fetchone()
        old_uid = old["user_id"] if old else None
        if new_uid == old_uid:
            continue
        name = cat[skin_id]["name"]
        if old_uid is not None:
            revoke_skin(con, old_uid, skin_id)
            notify(con, old_uid, "rank", "You lost the champion skin %s. Climb the Hell board to win it back." % name, {"skin": skin_id})
        if new_uid is not None:
            grant_skin(con, new_uid, skin_id)
            notify(con, new_uid, "rank", "Hell rank %d! You won the champion skin %s." % (rank, name), {"skin": skin_id})
            con.execute("INSERT OR REPLACE INTO rank_holders (skin_id, user_id) VALUES (?, ?)", (skin_id, new_uid))
        else:
            con.execute("DELETE FROM rank_holders WHERE skin_id = ?", (skin_id,))


@app.route('/api/run/finish', methods=['POST'])
def api_run_finish():
    user, _ = require_session()
    data = request.get_json(force=True, silent=True) or {}
    token = str(data.get("run", ""))[:80]
    score = _int_field(data, "score", 0, 10_000_000, "Score")
    wave = _int_field(data, "wave", 1, 10_000, "Wave") if "wave" in data else 1
    stars = _int_field(data, "stars", 0, 3, "Stars") if "stars" in data else 0
    now = int(time.time())
    awarded = 0
    best = None
    best_updated = False
    kind = mode = effect = ""
    with _db_lock:
        con = get_db()
        try:
            con.execute("BEGIN IMMEDIATE")
            run = con.execute("SELECT * FROM runs WHERE token = ? AND user_id = ?", (token, user["id"])).fetchone()
            if run is None or run["finished"]:
                raise ApiError(409, "This run was already submitted or has expired.")
            con.execute("UPDATE runs SET finished = 1 WHERE token = ?", (token,))
            kind, mode, effect = run["kind"], run["mode"], run["effect"]
            elapsed = max(0, now - int(run["started_at"]))
            score = min(score, int(400 * elapsed + 300))      # plausibility cap from server-side time
            wave = min(wave, int(elapsed / 1.5) + 2)
            if mode in COIN_MODES and elapsed >= 10:
                if kind == "level":
                    amount = 25 + max(1, stars) * 20 + score // 120
                else:
                    amount = 15 + max(0, wave - 1) * 8 + score // 180
                if mode == "hell":
                    amount *= 3
                amount = max(1, min(AWARD_CAPS[kind], amount))
                if effect == "luck" and mode == "hell":
                    amount *= 2
                awarded = amount
                con.execute("UPDATE users SET coins = coins + ? WHERE id = ?", (awarded, user["id"]))
                _log_coins(con, user["id"], awarded, "play:%s:%s%s" % (kind, mode, ":luck" if effect == "luck" else ""), user["id"])
            if kind == "endless" and elapsed >= 3:
                prev = con.execute("SELECT * FROM scores WHERE user_id = ? AND mode = ?", (user["id"], mode)).fetchone()
                if prev is None:
                    con.execute(
                        "INSERT INTO scores (user_id, mode, best_score, best_wave, effect, runs, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
                        (user["id"], mode, score, wave, effect, now),
                    )
                    best, best_updated = score, score > 0
                elif score > prev["best_score"]:
                    con.execute(
                        "UPDATE scores SET best_score = ?, best_wave = ?, effect = ?, runs = runs + 1, updated_at = ? WHERE user_id = ? AND mode = ?",
                        (score, wave, effect, now, user["id"], mode),
                    )
                    best, best_updated = score, True
                else:
                    con.execute("UPDATE scores SET runs = runs + 1 WHERE user_id = ? AND mode = ?", (user["id"], mode))
                    best = prev["best_score"]
                if best_updated and mode == "hell":
                    sync_rank_skins(con)
            con.commit()
        except Exception:
            con.rollback()
            raise
        row = get_user_by_id(con, user["id"])
        rank = rank_for(con, user["id"], mode) if kind == "endless" else None
    return _json({
        "user": user_public(row), "save": save_from_row(row), "awarded": awarded, "luck": bool(awarded and effect == "luck"),
        "mode": mode, "best": best, "best_updated": best_updated, "rank": rank,
    })


@app.route('/api/leaderboard', methods=['GET'])
def api_leaderboard():
    user, _ = require_session(csrf=False)
    mode = request.args.get("mode", "hell")
    if mode not in DIFFICULTIES and mode != "duels":
        raise ApiError(400, "Unknown leaderboard.")
    cat = catalog()
    rows_out = []
    me = None
    with _db_lock:
        con = get_db()
        if mode == "duels":
            rows = con.execute(
                """SELECT u.id, u.username,
                          SUM(CASE WHEN m.winner = u.id THEN 1 ELSE 0 END) AS wins,
                          SUM(CASE WHEN m.winner IS NOT NULL AND m.winner != u.id THEN 1 ELSE 0 END) AS losses,
                          SUM(CASE WHEN m.winner IS NULL THEN 1 ELSE 0 END) AS draws
                   FROM matches m JOIN users u ON u.id = m.p1 OR u.id = m.p2
                   WHERE m.status = 'finished' AND u.is_admin = 0
                   GROUP BY u.id ORDER BY wins DESC, losses ASC, u.username ASC LIMIT 50"""
            ).fetchall()
            for i, r in enumerate(rows, 1):
                item = {"rank": i, "username": r["username"], "wins": int(r["wins"]), "losses": int(r["losses"]), "draws": int(r["draws"]), "is_me": r["id"] == user["id"]}
                rows_out.append(item)
                if item["is_me"]:
                    me = item
        else:
            rows = con.execute(
                """SELECT s.*, u.username, u.save_json FROM scores s JOIN users u ON u.id = s.user_id
                   WHERE s.mode = ? AND u.is_admin = 0 AND s.best_score > 0
                   ORDER BY s.best_score DESC, s.updated_at ASC LIMIT 50""",
                (mode,),
            ).fetchall()
            for i, r in enumerate(rows, 1):
                try:
                    equipped = json.loads(r["save_json"]).get("equippedSkin", DEFAULT_SKIN)
                except Exception:
                    equipped = DEFAULT_SKIN
                item = {
                    "rank": i, "username": r["username"], "score": int(r["best_score"]), "wave": int(r["best_wave"]),
                    "effect": r["effect"], "skin": (cat.get(equipped) or {}).get("name", ""),
                    "is_me": r["user_id"] == user["id"], "when": int(r["updated_at"]),
                }
                rows_out.append(item)
                if item["is_me"]:
                    me = item
            if me is None:
                mine = con.execute("SELECT best_score, best_wave FROM scores WHERE user_id = ? AND mode = ?", (user["id"], mode)).fetchone()
                if mine and mine["best_score"] > 0 and not user["is_admin"]:
                    me = {"rank": rank_for(con, user["id"], mode), "score": int(mine["best_score"]), "wave": int(mine["best_wave"]), "username": user["username"], "is_me": True}
    return _json({"mode": mode, "rows": rows_out, "me": me, "champion_skins": {str(k): v for k, v in RANK_SKINS.items()}})


# ==========================================================================
# Notifications, forgot password
# ==========================================================================
@app.route('/api/notifications', methods=['GET'])
def api_notifications():
    user, _ = require_session(csrf=False)
    with _db_lock:
        con = get_db()
        items = [
            {"id": r["id"], "kind": r["kind"], "text": r["text"], "data": json.loads(r["data_json"] or "{}"),
             "created_at": r["created_at"], "read": r["read_at"] is not None}
            for r in con.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40", (user["id"],)).fetchall()
        ]
        unread = con.execute("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL", (user["id"],)).fetchone()["c"]
        chat_unread = con.execute(
            """SELECT COUNT(*) AS c FROM chat_messages cm
               JOIN chat_members m ON m.room_id = cm.room_id AND m.user_id = ? AND m.left_at IS NULL
               WHERE cm.id > m.last_read AND cm.kind = 'msg' AND cm.user_id != ?""",
            (user["id"], user["id"]),
        ).fetchone()["c"]
        pending = 0
        if user["is_admin"]:
            pending = con.execute("SELECT COUNT(*) AS c FROM password_requests WHERE status = 'open'").fetchone()["c"]
        match = current_match(con, user["id"])
        con.commit()
    return _json({"unread": unread, "items": items, "chat_unread": chat_unread, "pending_requests": pending, "match": match})


@app.route('/api/notifications/read', methods=['POST'])
def api_notifications_read():
    user, _ = require_session()
    data = request.get_json(force=True, silent=True) or {}
    now = int(time.time())
    with _db_lock:
        con = get_db()
        if data.get("all"):
            con.execute("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", (now, user["id"]))
        else:
            ids = [int(i) for i in (data.get("ids") or []) if str(i).isdigit()][:100]
            for nid in ids:
                con.execute("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL", (now, nid, user["id"]))
        con.commit()
    return _json({"ok": True})


@app.route('/api/forgot', methods=['POST'])
def api_forgot():
    if not rate_allow("forgot-ip", client_ip(), 10, 3600):
        raise ApiError(429, "Too many requests. Try again later.")
    data = request.get_json(force=True, silent=True) or {}
    username = str(data.get("username", "")).strip()
    if USERNAME_RE.match(username) and rate_allow("forgot-user", username.lower(), 3, 3600):
        with _db_lock:
            con = get_db()
            target = get_user_by_name(con, username)
            if target is not None and not target["is_admin"]:
                already = con.execute("SELECT 1 FROM password_requests WHERE user_id = ? AND status = 'open'", (target["id"],)).fetchone()
                if not already:
                    con.execute("INSERT INTO password_requests (user_id, username, created_at) VALUES (?, ?, ?)", (target["id"], target["username"], int(time.time())))
                    notify_admins(con, "forgot", "%s forgot their password and needs a reset." % target["username"], {"username": target["username"]})
                    con.commit()
    # Same answer whether or not the account exists, so usernames cannot be probed.
    return _json({"ok": True, "message": "If that account exists, the admin has been notified. Contact them to get your temporary password."})


# ==========================================================================
# Admin: password resets, skin editor, chat monitor
# ==========================================================================
@app.route('/api/admin/requests', methods=['GET'])
def api_admin_requests():
    require_admin()
    with _db_lock:
        rows = get_db().execute("SELECT * FROM password_requests ORDER BY (status = 'open') DESC, id DESC LIMIT 40").fetchall()
    return _json({"requests": [{"id": r["id"], "username": r["username"], "status": r["status"], "created_at": r["created_at"], "handled_at": r["handled_at"]} for r in rows]})


@app.route('/api/admin/reset-password', methods=['POST'])
def api_admin_reset_password():
    admin = require_admin()
    data = request.get_json(force=True, silent=True) or {}
    username = str(data.get("username", "")).strip()
    new = str(data.get("new_password", "")).strip() or secrets.token_urlsafe(7)
    if not (6 <= len(new) <= 128):
        raise ApiError(400, "Password must be between 6 and 128 characters.")
    with _db_lock:
        con = get_db()
        target = get_user_by_name(con, username)
        if target is None:
            raise ApiError(404, "No such user.")
        if target["is_admin"]:
            raise ApiError(403, "Admin accounts cannot be reset this way.")
        con.execute("UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?", (hash_password(new), target["id"]))
        con.execute("DELETE FROM sessions WHERE user_id = ?", (target["id"],))
        con.execute("UPDATE password_requests SET status = 'done', handled_at = ? WHERE user_id = ? AND status = 'open'", (int(time.time()), target["id"]))
        _log_coins(con, target["id"], 0, "password reset by " + admin["username"], admin["id"])
        con.commit()
    return _json({"username": target["username"], "password": new})


def _clean_color(value, fallback: str) -> str:
    value = str(value or "").strip()
    return value if COLOR_RE.match(value) else fallback


@app.route('/api/admin/skins', methods=['POST'])
def api_admin_skins():
    require_admin()
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("name", "")).strip()[:60]
    if len(name) < 3:
        raise ApiError(400, "Give the skin a name (3+ characters).")
    sid = str(data.get("id", "")).strip().lower() or re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:32]
    if not SKIN_ID_RE.match(sid):
        raise ApiError(400, "Skin id must be 2-32 lowercase letters, numbers or underscores.")
    kind = str(data.get("kind", "snake"))
    source = str(data.get("source", "shop"))
    effect = str(data.get("effect", ""))
    rarity = str(data.get("rarity", "common")).lower()[:24]
    if kind not in SKIN_KINDS or source not in SKIN_SOURCES or effect not in EFFECTS:
        raise ApiError(400, "Invalid skin type, source or effect.")
    if kind == "board" and effect:
        raise ApiError(400, "Board skins cannot have effects.")
    price = _int_field(data, "price", 0, 10_000_000, "Price")
    desc = str(data.get("desc", "")).strip()[:240]
    if kind == "snake":
        s = data.get("snake") if isinstance(data.get("snake"), dict) else {}
        r = data.get("robe") if isinstance(data.get("robe"), dict) else {}
        dark = _clean_color(s.get("dark"), "#18351f")
        payload = {
            "snake": {"base": _clean_color(s.get("base"), "#3c7a48"), "light": _clean_color(s.get("light"), "#8cc984"),
                      "dark": dark, "scale": "rgba(0,0,0,.34)", "eye": _clean_color(s.get("eye"), "#ffcf4a")},
            "robe": {"main": _clean_color(r.get("main"), "#8f1f2e"), "deep": _clean_color(r.get("deep"), "#4b0c18"),
                     "accent": _clean_color(r.get("accent"), "#e7c574"), "letter": (str(r.get("letter") or "G")[:1] or "G")},
            "hat": data.get("hat") if data.get("hat") in HATS else "wizard",
            "eyes": data.get("eyes") if data.get("eyes") in EYES else "round",
            "glasses": bool(data.get("glasses", False)),
            "glow": _clean_color(data.get("glow"), "rgba(230,80,70,.2)"),
        }
    else:
        b = data.get("board") if isinstance(data.get("board"), dict) else {}
        accent = _clean_color(b.get("accent"), "#ffd07a")
        payload = {"board": {
            "floorA": _clean_color(b.get("floorA"), "#2a2236"), "floorB": _clean_color(b.get("floorB"), "#151020"),
            "wall": _clean_color(b.get("wall"), "#4a392a"), "wallTop": _clean_color(b.get("wallTop"), "#7c6144"),
            "wallDark": _clean_color(b.get("wallDark"), "#241a11"), "accent": accent,
            "wallStyle": b.get("wallStyle") if b.get("wallStyle") in WALL_STYLES else "stone",
            "tint": "rgba(255,255,255,.05)",
        }}
    active = 0 if data.get("active") is False else 1
    now = int(time.time())
    with _db_lock:
        con = get_db()
        existing = con.execute("SELECT id FROM skins WHERE id = ?", (sid,)).fetchone()
        if existing and sid == DEFAULT_SKIN:
            active = 1
        if existing:
            con.execute(
                """UPDATE skins SET name = ?, kind = ?, rarity = ?, price = ?, description = ?, source = ?, effect = ?, active = ?, data_json = ? WHERE id = ?""",
                (name, kind, rarity, price, desc, source, effect, active, json.dumps(payload, separators=(",", ":")), sid),
            )
        else:
            con.execute(
                """INSERT INTO skins (id, name, kind, rarity, price, description, source, effect, active, data_json, sort_order, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (sid, name, kind, rarity, price, desc, source, effect, active, json.dumps(payload, separators=(",", ":")), 5000 + now % 100000, now),
            )
            for a in con.execute("SELECT id FROM users WHERE is_admin = 1").fetchall():
                grant_skin(con, a["id"], sid)
        con.commit()
        catalog(True)
    return _json({"skin": catalog()[sid], "created": not existing})


@app.route('/api/admin/chat/rooms', methods=['GET'])
def api_admin_chat_rooms():
    require_admin()
    out = []
    with _db_lock:
        con = get_db()
        for r in con.execute("SELECT * FROM chat_rooms ORDER BY id DESC LIMIT 200").fetchall():
            members = con.execute(
                "SELECT u.username, m.left_at FROM chat_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = ? ORDER BY m.joined_at", (r["id"],)
            ).fetchall()
            stats = con.execute("SELECT COUNT(*) AS c, MAX(created_at) AS last FROM chat_messages WHERE room_id = ? AND kind = 'msg'", (r["id"],)).fetchone()
            owner = get_user_by_id(con, r["owner_id"])
            out.append({
                "id": r["id"], "name": r["name"], "owner": owner["username"] if owner else "?", "closed": bool(r["closed"]),
                "created_at": r["created_at"], "messages": stats["c"], "last": stats["last"],
                "members": [m["username"] for m in members if m["left_at"] is None],
                "former": [m["username"] for m in members if m["left_at"] is not None],
            })
    return _json({"rooms": out})


# ==========================================================================
# Private chat rooms
# ==========================================================================
def _room_members(con, room_id: int) -> list:
    return [r["username"] for r in con.execute(
        "SELECT u.username FROM chat_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = ? AND m.left_at IS NULL ORDER BY m.joined_at", (room_id,)
    ).fetchall()]


def _room_dict(con, room, uid: int) -> dict:
    owner = get_user_by_id(con, room["owner_id"])
    return {
        "id": room["id"], "name": room["name"], "owner": owner["username"] if owner else "?",
        "closed": bool(room["closed"]), "members": _room_members(con, room["id"]), "i_am_owner": room["owner_id"] == uid,
    }


def _chat_sys(con, room_id: int, text: str) -> None:
    con.execute("INSERT INTO chat_messages (room_id, user_id, body, kind, created_at) VALUES (?, NULL, ?, 'sys', ?)", (room_id, text[:300], int(time.time())))


def _get_room(con, rid: int):
    room = con.execute("SELECT * FROM chat_rooms WHERE id = ?", (rid,)).fetchone()
    if room is None:
        raise ApiError(404, "Room not found.")
    return room


def _is_member(con, rid: int, uid: int) -> bool:
    return con.execute("SELECT 1 FROM chat_members WHERE room_id = ? AND user_id = ? AND left_at IS NULL", (rid, uid)).fetchone() is not None


@app.route('/api/chat/rooms', methods=['GET', 'POST'])
def api_chat_rooms():
    user, _ = require_session(csrf=(request.method == 'POST'))
    if request.method == 'POST':
        if not rate_allow("room-create", str(user["id"]), 6, 3600):
            raise ApiError(429, "You are creating rooms too quickly.")
        data = request.get_json(force=True, silent=True) or {}
        name = re.sub(r"\s+", " ", str(data.get("name", ""))).strip()
        if not (3 <= len(name) <= 30):
            raise ApiError(400, "Room name must be 3-30 characters.")
        names = []
        for n in (data.get("members") or [])[:CHAT_MAX_MEMBERS]:
            n = str(n).strip()
            if n and n.lower() not in [x.lower() for x in names] and n.lower() != user["username"].lower():
                names.append(n)
        with _db_lock:
            con = get_db()
            try:
                con.execute("BEGIN IMMEDIATE")
                row = get_user_by_id(con, user["id"])
                found, missing = [], []
                for n in names:
                    target = get_user_by_name(con, n)
                    (found if target else missing).append(target if target else n)
                if missing:
                    raise ApiError(404, "No such player: " + ", ".join(missing))
                cost = 0 if row["is_admin"] else CHAT_ROOM_COST
                if int(row["coins"]) < cost:
                    raise ApiError(400, "A private room costs %s coins." % format(CHAT_ROOM_COST, ","))
                now = int(time.time())
                if cost:
                    con.execute("UPDATE users SET coins = coins - ? WHERE id = ?", (cost, row["id"]))
                    _log_coins(con, row["id"], -cost, "chat room: " + name, row["id"])
                cur = con.execute("INSERT INTO chat_rooms (name, owner_id, created_at) VALUES (?, ?, ?)", (name, row["id"], now))
                rid = int(cur.lastrowid)
                con.execute("INSERT INTO chat_members (room_id, user_id, joined_at) VALUES (?, ?, ?)", (rid, row["id"], now))
                _chat_sys(con, rid, "%s created the room." % row["username"])
                for target in found:
                    con.execute("INSERT INTO chat_members (room_id, user_id, joined_at) VALUES (?, ?, ?)", (rid, target["id"], now))
                    notify(con, target["id"], "chat", "%s added you to the private room \"%s\"." % (row["username"], name), {"room_id": rid})
                con.commit()
            except Exception:
                con.rollback()
                raise
            room = _get_room(con, rid)
            result = {"user": user_public(get_user_by_id(con, user["id"])), "room": _room_dict(con, room, user["id"])}
        return _json(result, 201)

    out = []
    with _db_lock:
        con = get_db()
        rooms = con.execute(
            """SELECT r.*, m.last_read FROM chat_rooms r JOIN chat_members m ON m.room_id = r.id
               WHERE m.user_id = ? AND m.left_at IS NULL AND r.closed = 0
               ORDER BY COALESCE((SELECT MAX(id) FROM chat_messages WHERE room_id = r.id), 0) DESC""",
            (user["id"],),
        ).fetchall()
        for r in rooms:
            last = con.execute(
                "SELECT m.body, m.created_at, u.username FROM chat_messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.room_id = ? AND m.kind = 'msg' ORDER BY m.id DESC LIMIT 1", (r["id"],)
            ).fetchone()
            unread = con.execute(
                "SELECT COUNT(*) AS c FROM chat_messages WHERE room_id = ? AND id > ? AND kind = 'msg' AND user_id != ?", (r["id"], r["last_read"], user["id"])
            ).fetchone()["c"]
            item = _room_dict(con, r, user["id"])
            item["unread"] = unread
            item["last"] = {"body": last["body"][:80], "user": last["username"], "at": last["created_at"]} if last else None
            out.append(item)
    return _json({"rooms": out, "cost": CHAT_ROOM_COST, "can_create": True})


@app.route('/api/chat/rooms/<int:rid>/messages', methods=['GET', 'POST'])
def api_chat_messages(rid: int):
    user, _ = require_session(csrf=(request.method == 'POST'))
    with _db_lock:
        con = get_db()
        room = _get_room(con, rid)
        member = _is_member(con, rid, user["id"])
        if request.method == 'POST':
            if not member or room["closed"]:
                raise ApiError(403, "You are not in this room.")
            if not rate_allow("chat-send", str(user["id"]), 40, 60):
                raise ApiError(429, "Slow down a little.")
            data = request.get_json(force=True, silent=True) or {}
            body = str(data.get("body", "")).replace("\r", "").strip()
            if not body:
                raise ApiError(400, "Type a message first.")
            body = body[:500]
            cur = con.execute("INSERT INTO chat_messages (room_id, user_id, body, created_at) VALUES (?, ?, ?, ?)", (rid, user["id"], body, int(time.time())))
            mid = int(cur.lastrowid)
            con.execute("UPDATE chat_members SET last_read = ? WHERE room_id = ? AND user_id = ?", (mid, rid, user["id"]))
            con.execute("DELETE FROM chat_messages WHERE room_id = ? AND id <= ?", (rid, mid - CHAT_KEEP_MESSAGES))
            con.commit()
            return _json({"ok": True, "id": mid}, 201)

        if not member and not user["is_admin"]:
            raise ApiError(403, "You are not in this room.")
        try:
            after = max(0, int(request.args.get("after", "0")))
        except ValueError:
            after = 0
        if after:
            rows = con.execute(
                "SELECT m.id, m.body, m.kind, m.created_at, u.username FROM chat_messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.room_id = ? AND m.id > ? ORDER BY m.id LIMIT 200",
                (rid, after),
            ).fetchall()
        else:
            rows = list(reversed(con.execute(
                "SELECT m.id, m.body, m.kind, m.created_at, u.username FROM chat_messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.room_id = ? ORDER BY m.id DESC LIMIT 100",
                (rid,),
            ).fetchall()))
        if member and rows:
            con.execute("UPDATE chat_members SET last_read = MAX(last_read, ?) WHERE room_id = ? AND user_id = ?", (rows[-1]["id"], rid, user["id"]))
            con.commit()
        info = _room_dict(con, room, user["id"])
        info["is_member"] = member
        info["admin_view"] = bool(user["is_admin"] and not member)
    return _json({
        "room": info,
        "messages": [{"id": r["id"], "body": r["body"], "kind": r["kind"], "at": r["created_at"], "user": r["username"]} for r in rows],
    })


@app.route('/api/chat/rooms/<int:rid>/members', methods=['POST'])
def api_chat_add_member(rid: int):
    user, _ = require_session()
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("username", "")).strip()
    with _db_lock:
        con = get_db()
        try:
            con.execute("BEGIN IMMEDIATE")
            room = _get_room(con, rid)
            if room["closed"] or room["owner_id"] != user["id"]:
                raise ApiError(403, "Only the room owner can add players.")
            target = get_user_by_name(con, name)
            if target is None:
                raise ApiError(404, "No such player.")
            if _is_member(con, rid, target["id"]):
                raise ApiError(409, "%s is already in the room." % target["username"])
            if len(_room_members(con, rid)) >= CHAT_MAX_MEMBERS:
                raise ApiError(400, "This room is full.")
            now = int(time.time())
            last_id = con.execute("SELECT COALESCE(MAX(id), 0) AS m FROM chat_messages WHERE room_id = ?", (rid,)).fetchone()["m"]
            con.execute(
                "INSERT INTO chat_members (room_id, user_id, joined_at, left_at, last_read) VALUES (?, ?, ?, NULL, ?) "
                "ON CONFLICT(room_id, user_id) DO UPDATE SET left_at = NULL, joined_at = excluded.joined_at, last_read = excluded.last_read",
                (rid, target["id"], now, last_id),
            )
            _chat_sys(con, rid, "%s added %s." % (user["username"], target["username"]))
            notify(con, target["id"], "chat", "%s added you to the private room \"%s\"." % (user["username"], room["name"]), {"room_id": rid})
            con.commit()
        except Exception:
            con.rollback()
            raise
        info = _room_dict(con, _get_room(con, rid), user["id"])
    return _json({"room": info})


@app.route('/api/chat/rooms/<int:rid>/leave', methods=['POST'])
def api_chat_leave(rid: int):
    user, _ = require_session()
    with _db_lock:
        con = get_db()
        try:
            con.execute("BEGIN IMMEDIATE")
            room = _get_room(con, rid)
            if not _is_member(con, rid, user["id"]):
                raise ApiError(404, "You are not in this room.")
            now = int(time.time())
            con.execute("UPDATE chat_members SET left_at = ? WHERE room_id = ? AND user_id = ?", (now, rid, user["id"]))
            _chat_sys(con, rid, "%s left the room." % user["username"])
            rest = con.execute(
                "SELECT user_id FROM chat_members WHERE room_id = ? AND left_at IS NULL ORDER BY joined_at LIMIT 1", (rid,)
            ).fetchone()
            if rest is None:
                con.execute("UPDATE chat_rooms SET closed = 1 WHERE id = ?", (rid,))
            elif room["owner_id"] == user["id"]:
                con.execute("UPDATE chat_rooms SET owner_id = ? WHERE id = ?", (rest["user_id"], rid))
                new_owner = get_user_by_id(con, rest["user_id"])
                _chat_sys(con, rid, "%s is now the room owner." % new_owner["username"])
            con.commit()
        except Exception:
            con.rollback()
            raise
    return _json({"ok": True})


# ==========================================================================
# Challenge matches: two players on one larger board.
# The server is authoritative and advances the game lazily from the clock, so
# it works on hosts without WebSockets (PythonAnywhere): clients poll.
# ==========================================================================
MATCH_W, MATCH_H = 36, 27
MATCH_TICK = 0.16
MATCH_DURATION = 75
MATCH_COUNTDOWN = 5
MATCH_FOOD = 6
MATCH_RESPAWN_TICKS = 12
MATCH_IDLE_FORFEIT = 20
MATCH_DIRS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}


def _mulberry(seed: int):
    """Deterministic PRNG shared with the browser (src/duel.js) so both run the same game."""
    state = [seed & 0xFFFFFFFF]

    def nxt() -> float:
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = state[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return nxt


def _match_spawn(st: dict, idx: int) -> None:
    s = st["snakes"][idx]
    dx = 1 if idx == 0 else -1
    hx = 5 if idx == 0 else MATCH_W - 6
    taken = {tuple(c) for sn in st["snakes"] for c in sn["cells"]}
    base_y = MATCH_H // 3 if idx == 0 else (2 * MATCH_H) // 3   # different rows: no instant head-on crash
    for off in [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]:
        hy = base_y + off
        cells = [[hx - dx * i, hy] for i in range(4)]
        if all(tuple(c) not in taken for c in cells):
            s["cells"], s["dir"], s["next"], s["grow"], s["dead"] = cells, [dx, 0], None, 0, 0
            return
    s["dead"] = 1  # board is crowded; try again next tick


def _match_food(st: dict, rnd) -> None:
    taken = {tuple(c) for sn in st["snakes"] for c in sn["cells"]} | {(f["x"], f["y"]) for f in st["food"]}
    guard = 0
    while len(st["food"]) < MATCH_FOOD and guard < 200:
        guard += 1
        x = 1 + int(rnd() * (MATCH_W - 2))
        y = 1 + int(rnd() * (MATCH_H - 2))
        if (x, y) in taken:
            continue
        gold = rnd() < 0.15
        st["food"].append({"x": x, "y": y, "v": 30 if gold else 10, "gold": gold})
        taken.add((x, y))


def _match_tick(st: dict, tick: int) -> None:
    rnd = _mulberry((st["seed"] + tick * 2654435761) & 0xFFFFFFFF)
    snakes = st["snakes"]
    for i, s in enumerate(snakes):
        if s["dead"] > 0:
            s["dead"] -= 1
            if s["dead"] == 0:
                _match_spawn(st, i)
    heads = {}
    for i, s in enumerate(snakes):
        if s["dead"] > 0 or not s["cells"]:
            continue
        nxt = s.get("next")
        if nxt and not (nxt[0] == -s["dir"][0] and nxt[1] == -s["dir"][1]):
            s["dir"] = nxt
        s["next"] = None
        hx, hy = s["cells"][0]
        heads[i] = (hx + s["dir"][0], hy + s["dir"][1])
    occupied = {}
    for i, s in enumerate(snakes):
        if s["dead"] > 0 or not s["cells"]:
            continue
        body = s["cells"] if s["grow"] > 0 else s["cells"][:-1]
        for c in body:
            occupied[(c[0], c[1])] = i
    crashed = set()
    for i, (x, y) in heads.items():
        if x < 1 or y < 1 or x >= MATCH_W - 1 or y >= MATCH_H - 1 or (x, y) in occupied:  # border cells are walls
            crashed.add(i)
    if len(heads) == 2 and heads[0] == heads[1]:
        crashed.update(heads)
    for i in heads:
        s = snakes[i]
        if i in crashed:
            s["cells"], s["dead"] = [], MATCH_RESPAWN_TICKS
            s["crashes"] += 1
            continue
        s["cells"].insert(0, list(heads[i]))
        for f in list(st["food"]):
            if (f["x"], f["y"]) == heads[i]:
                s["score"] += f["v"]
                s["eaten"] += 1
                s["grow"] += 2 if f["gold"] else 1
                st["food"].remove(f)
        if s["grow"] > 0:
            s["grow"] -= 1
        else:
            s["cells"].pop()
    _match_food(st, rnd)


def _match_initial_state(con, m) -> dict:
    cat = catalog()
    players = []
    for uid in (m["p1"], m["p2"]):
        u = get_user_by_id(con, uid)
        skin = cat.get(save_from_row(u)["equippedSkin"]) or cat.get(DEFAULT_SKIN) or {}
        save = save_from_row(u)
        house = str(save.get("house") or "gryffindor")
        players.append({
            "name": u["username"], "house": house if house in HOUSES else "gryffindor",
            "skin": {k: skin.get(k) for k in ("id", "name", "snake", "robe", "hat", "eyes", "glasses", "glow")},
        })
    st = {
        "seed": secrets.randbelow(2_000_000_000), "tick": 0, "w": MATCH_W, "h": MATCH_H,
        "players": players, "food": [],
        "snakes": [{"cells": [], "dir": [1, 0], "next": None, "score": 0, "eaten": 0, "dead": 0, "grow": 0, "crashes": 0},
                   {"cells": [], "dir": [-1, 0], "next": None, "score": 0, "eaten": 0, "dead": 0, "grow": 0, "crashes": 0}],
        "seen": [time.time(), time.time()], "result": None,
    }
    _match_spawn(st, 0)
    _match_spawn(st, 1)
    _match_food(st, _mulberry(st["seed"]))
    return st


def _match_finish(con, m, st: dict, reason: str, forced_winner=None) -> None:
    s0, s1 = st["snakes"][0]["score"], st["snakes"][1]["score"]
    if forced_winner is not None:
        win_idx = forced_winner
    else:
        win_idx = 0 if s0 > s1 else 1 if s1 > s0 else None
    winner_uid = None if win_idx is None else (m["p1"] if win_idx == 0 else m["p2"])
    st["result"] = {"winner": win_idx, "scores": [s0, s1], "reason": reason}
    con.execute("UPDATE matches SET status = 'finished', winner = ?, finished_at = ?, state_json = ? WHERE id = ?",
                (winner_uid, int(time.time()), json.dumps(st, separators=(",", ":")), m["id"]))
    for idx, uid in enumerate((m["p1"], m["p2"])):
        other = st["players"][1 - idx]["name"]
        verdict = "It was a draw" if win_idx is None else ("You won" if win_idx == idx else "You lost")
        notify(con, uid, "match_done", "%s against %s (%d - %d)." % (verdict, other, s0 if idx == 0 else s1, s1 if idx == 0 else s0), {"match_id": m["id"]})


def _match_advance(con, m, now: float):
    """Bring an active match up to date. Returns (row, state)."""
    st = json.loads(m["state_json"] or "{}")
    if m["status"] != "active" or not st:
        return m, st
    total = int(MATCH_DURATION / MATCH_TICK)
    target = min(total, int((now - m["start_at"]) / MATCH_TICK))
    changed = False
    steps = 0
    while st["tick"] < target and steps < 500:
        st["tick"] += 1
        _match_tick(st, st["tick"])
        steps += 1
        changed = True
    if st["tick"] >= total:
        _match_finish(con, m, st, "time")
        changed = False
    else:
        for idx in (0, 1):
            if st["tick"] > 40 and now - st["seen"][idx] > MATCH_IDLE_FORFEIT:
                _match_finish(con, m, st, "forfeit", forced_winner=1 - idx)
                changed = False
                break
    if changed:
        con.execute("UPDATE matches SET state_json = ? WHERE id = ?", (json.dumps(st, separators=(",", ":")), m["id"]))
    return con.execute("SELECT * FROM matches WHERE id = ?", (m["id"],)).fetchone(), st


def match_summary(con, row, uid: int) -> dict:
    names = {r["id"]: r["username"] for r in con.execute("SELECT id, username FROM users WHERE id IN (?, ?)", (row["p1"], row["p2"])).fetchall()}
    return {
        "id": row["id"], "status": row["status"], "you": 1 if row["p1"] == uid else 2,
        "p1": names.get(row["p1"], "?"), "p2": names.get(row["p2"], "?"),
        "start_at": row["start_at"], "server_now": time.time(),
    }


def current_match(con, uid: int):
    row = con.execute(
        "SELECT * FROM matches WHERE (p1 = ? OR p2 = ?) AND status IN ('pending', 'active') ORDER BY id DESC LIMIT 1", (uid, uid)
    ).fetchone()
    if row is None:
        return None
    now = time.time()
    if row["status"] == "pending" and now - row["created_at"] > 600:
        con.execute("UPDATE matches SET status = 'expired' WHERE id = ?", (row["id"],))
        return None
    if row["status"] == "active":
        row, st = _match_advance(con, row, now)
        if row["status"] != "active":
            return None
    return match_summary(con, row, uid)


def _my_match(con, mid: int, uid: int):
    row = con.execute("SELECT * FROM matches WHERE id = ?", (mid,)).fetchone()
    if row is None or uid not in (row["p1"], row["p2"]):
        raise ApiError(404, "Match not found.")
    return row


@app.route('/api/match/challenge', methods=['POST'])
def api_match_challenge():
    user, _ = require_session()
    if not rate_allow("challenge", str(user["id"]), 12, 3600):
        raise ApiError(429, "Too many challenges. Try again later.")
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("to", "")).strip()
    with _db_lock:
        con = get_db()
        try:
            con.execute("BEGIN IMMEDIATE")
            target = get_user_by_name(con, name)
            if target is None:
                raise ApiError(404, "No player with that username.")
            if target["id"] == user["id"]:
                raise ApiError(400, "You cannot challenge yourself.")
            for uid in (user["id"], target["id"]):
                if current_match(con, uid):
                    raise ApiError(409, "You are already in a challenge." if uid == user["id"] else "%s is already in a challenge." % target["username"])
            cur = con.execute("INSERT INTO matches (p1, p2, status, created_at) VALUES (?, ?, 'pending', ?)", (user["id"], target["id"], int(time.time())))
            mid = int(cur.lastrowid)
            notify(con, target["id"], "challenge", "%s challenged you to a duel!" % user["username"], {"match_id": mid})
            con.commit()
        except Exception:
            con.rollback()
            raise
        summary = match_summary(con, con.execute("SELECT * FROM matches WHERE id = ?", (mid,)).fetchone(), user["id"])
    return _json({"match": summary}, 201)


@app.route('/api/match/current', methods=['GET'])
def api_match_current():
    user, _ = require_session(csrf=False)
    with _db_lock:
        con = get_db()
        summary = current_match(con, user["id"])
        con.commit()
    return _json({"match": summary})


@app.route('/api/match/<int:mid>/<action>', methods=['POST'])
def api_match_action(mid: int, action: str):
    user, _ = require_session()
    if action not in ("accept", "decline", "cancel", "forfeit"):
        raise ApiError(404, "Unknown action.")
    with _db_lock:
        con = get_db()
        try:
            con.execute("BEGIN IMMEDIATE")
            m = _my_match(con, mid, user["id"])
            me = 1 if m["p1"] == user["id"] else 2
            if action == "accept":
                if me != 2 or m["status"] != "pending":
                    raise ApiError(409, "This challenge cannot be accepted.")
                st = _match_initial_state(con, m)
                con.execute("UPDATE matches SET status = 'active', start_at = ?, state_json = ? WHERE id = ?",
                            (time.time() + MATCH_COUNTDOWN, json.dumps(st, separators=(",", ":")), mid))
                notify(con, m["p1"], "challenge", "%s accepted your duel. Get ready!" % user["username"], {"match_id": mid})
            elif action in ("decline", "cancel"):
                if m["status"] != "pending" or (action == "decline" and me != 2) or (action == "cancel" and me != 1):
                    raise ApiError(409, "Nothing to %s." % action)
                con.execute("UPDATE matches SET status = ? WHERE id = ?", ("declined" if action == "decline" else "cancelled", mid))
                if action == "decline":
                    notify(con, m["p1"], "challenge", "%s declined your duel." % user["username"], {"match_id": mid})
            else:  # forfeit
                if m["status"] != "active":
                    raise ApiError(409, "This match is not running.")
                m, st = _match_advance(con, m, time.time())
                if m["status"] == "active":
                    _match_finish(con, m, st, "forfeit", forced_winner=2 - me)
            con.commit()
        except Exception:
            con.rollback()
            raise
        row = con.execute("SELECT * FROM matches WHERE id = ?", (mid,)).fetchone()
        summary = match_summary(con, row, user["id"])
    return _json({"match": summary})


@app.route('/api/match/<int:mid>/state', methods=['GET'])
def api_match_state(mid: int):
    user, _ = require_session(csrf=False)
    return _match_state_response(mid, user, None)


@app.route('/api/match/<int:mid>/dir', methods=['POST'])
def api_match_dir(mid: int):
    user, _ = require_session()
    data = request.get_json(force=True, silent=True) or {}
    d = str(data.get("dir", ""))
    if d not in MATCH_DIRS:
        raise ApiError(400, "Bad direction.")
    return _match_state_response(mid, user, d)


def _match_state_response(mid: int, user, direction):
    with _db_lock:
        con = get_db()
        try:
            con.execute("BEGIN IMMEDIATE")
            m = _my_match(con, mid, user["id"])
            idx = 0 if m["p1"] == user["id"] else 1
            now = time.time()
            st = json.loads(m["state_json"] or "{}")
            if m["status"] == "active" and st:
                st["seen"][idx] = now
                if direction and st["tick"] >= 0 and now >= m["start_at"] - 1:
                    st["snakes"][idx]["next"] = list(MATCH_DIRS[direction])
                con.execute("UPDATE matches SET state_json = ? WHERE id = ?", (json.dumps(st, separators=(",", ":")), mid))
                m = con.execute("SELECT * FROM matches WHERE id = ?", (mid,)).fetchone()
                m, st = _match_advance(con, m, now)
            con.commit()
        except Exception:
            con.rollback()
            raise
    out = {
        "id": mid, "status": m["status"], "you": idx, "server_now": time.time(), "start_at": m["start_at"],
        "tick_ms": int(MATCH_TICK * 1000), "duration": MATCH_DURATION, "countdown": MATCH_COUNTDOWN,
    }
    if st:
        out.update({"tick": st["tick"], "w": st["w"], "h": st["h"], "seed": st["seed"], "players": st["players"], "food": st["food"],
                    "snakes": [{"cells": s["cells"], "score": s["score"], "eaten": s["eaten"], "dead": s["dead"], "dir": s["dir"],
                                "next": s.get("next"), "grow": s["grow"], "crashes": s["crashes"]} for s in st["snakes"]],
                    "result": st["result"]})
    return _json(out)


# ==========================================================================
# Static files: an explicit allow-list. The server code, database, deploy
# notes and everything else in the project folder are never served.
# ==========================================================================
def _static(directory: Path, name: str):
    resp = send_from_directory(str(directory), name)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route('/')
def serve_index():
    return _static(ROOT, "index.html")


@app.route('/styles.css')
def serve_css():
    return _static(ROOT, "styles.css")


@app.route('/src/<name>')
def serve_src(name):
    if not re.match(r"^[a-z0-9_]+\.js$", name):
        return Response("Not found", status=404)
    return _static(ROOT / "src", name)


@app.route('/favicon.ico')
def serve_favicon():
    return Response(status=204)


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    )
    return resp


@app.teardown_request
def _cleanup_transaction(exc):
    con = _db
    if con is not None:
        with _db_lock:
            try:
                if con.in_transaction:
                    con.rollback()
            except Exception:
                pass


if __name__ == "__main__":
    app.run(host=HOST, port=PORT)