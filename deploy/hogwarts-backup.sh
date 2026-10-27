#!/bin/sh
# Make a consistent online backup of the SQLite database.
# Install as /usr/local/bin/hogwarts-backup and run from cron.
set -eu

DATA_DIR="${HPS_DATA:-/var/lib/hogwarts-serpent}"
BACKUP_DIR="${HPS_BACKUP_DIR:-/var/backups/hogwarts-serpent}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%d-%H%M%S)

python3 - "$DATA_DIR/game.db" "$BACKUP_DIR/game-$STAMP.db" <<'PY'
import sqlite3
import sys

src_path, dst_path = sys.argv[1], sys.argv[2]
src = sqlite3.connect(src_path)
dst = sqlite3.connect(dst_path)
try:
    src.backup(dst)
finally:
    dst.close()
    src.close()
PY

find "$BACKUP_DIR" -type f -name 'game-*.db' -mtime +14 -delete
