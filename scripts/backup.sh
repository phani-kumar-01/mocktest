#!/bin/bash
set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/nptel_exam_backup_$TIMESTAMP.sql.gz"

echo "Creating PostgreSQL backup to $BACKUP_FILE..."

if command -v docker >/dev/null 2>&1 && docker ps | grep -q nptel_db; then
  docker exec nptel_db pg_dump -U exam exam | gzip > "$BACKUP_FILE"
elif [ -n "$DATABASE_URL" ]; then
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
else
  echo "No active PostgreSQL container or DATABASE_URL found."
  exit 1
fi

echo "Backup completed successfully: $BACKUP_FILE"
ls -lh "$BACKUP_FILE"
