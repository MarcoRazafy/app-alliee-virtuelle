#!/usr/bin/env bash

set -euo pipefail

DB_URL="${DATABASE_URL:-}"
OUT_DIR="${1:-./backups}"
KEEP="${BACKUP_KEEP:-14}"

if [ -z "$DB_URL" ]; then
  echo "❌ DATABASE_URL manquant." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
FILE="$OUT_DIR/alliee_virtuelle_${TS}.sql.gz"

echo "→ Sauvegarde en cours…"
pg_dump "$DB_URL" | gzip > "$FILE"
echo "✅ Sauvegarde créée : $FILE ($(du -h "$FILE" | cut -f1))"

ls -1t "$OUT_DIR"/alliee_virtuelle_*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "→ Rotation : $KEEP sauvegardes conservées au maximum."
