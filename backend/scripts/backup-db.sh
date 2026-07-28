#!/usr/bin/env bash
#
# Sauvegarde PostgreSQL de L'Alliée Virtuelle via pg_dump (compressée + rotation).
#
# Usage :
#   DATABASE_URL='postgres://user:pass@host:5432/base' ./scripts/backup-db.sh [dossier_sortie]
#
# Variables :
#   DATABASE_URL   (requis)  chaîne de connexion de la base à sauvegarder
#   BACKUP_KEEP    (optionnel, def. 14)  nombre de sauvegardes à conserver (rotation)
#
# Prérequis : pg_dump installé (paquet postgresql-client) et gzip.
# NB : sur un hébergeur managé (Render, Railway, Supabase…), les sauvegardes automatiques
#      sont en général déjà fournies par la plateforme — ce script vise surtout un VPS.

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

# Rotation : ne garde que les $KEEP sauvegardes les plus récentes.
ls -1t "$OUT_DIR"/alliee_virtuelle_*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "→ Rotation : $KEEP sauvegardes conservées au maximum."
