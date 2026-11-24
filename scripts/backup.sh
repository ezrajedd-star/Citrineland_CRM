#!/bin/sh
# Nightly PostgreSQL backup to DigitalOcean Spaces with retention.
# Used by the `backup` service in docker-compose.yml (profile: localdb) — only needed when
# PostgreSQL runs on the Droplet. DO Managed Databases have their own daily backups.
#
# Env: DATABASE_URL, SPACES_ENDPOINT, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET, BACKUP_RETENTION_DAYS (default 30)
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
PREFIX="backups/postgres"
export AWS_ACCESS_KEY_ID="$SPACES_KEY"
export AWS_SECRET_ACCESS_KEY="$SPACES_SECRET"
export AWS_DEFAULT_REGION="${SPACES_REGION:-sgp1}"

run_backup() {
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  FILE="/tmp/citrineland-${STAMP}.sql.gz"
  echo "[backup] dumping database → ${FILE}"
  pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" | gzip -9 > "$FILE"
  echo "[backup] uploading to s3://${SPACES_BUCKET}/${PREFIX}/"
  aws --endpoint-url "$SPACES_ENDPOINT" s3 cp "$FILE" "s3://${SPACES_BUCKET}/${PREFIX}/$(basename "$FILE")" --acl private
  rm -f "$FILE"

  echo "[backup] pruning backups older than ${RETENTION_DAYS} days"
  CUTOFF="$(date -u -d "@$(( $(date +%s) - RETENTION_DAYS * 86400 ))" +%Y%m%d 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%Y%m%d)"
  aws --endpoint-url "$SPACES_ENDPOINT" s3 ls "s3://${SPACES_BUCKET}/${PREFIX}/" | awk '{print $4}' | while read -r KEY; do
    D="$(echo "$KEY" | sed -n 's/^citrineland-\([0-9]\{8\}\)T.*/\1/p')"
    if [ -n "$D" ] && [ "$D" -lt "$CUTOFF" ]; then
      echo "[backup] deleting $KEY"
      aws --endpoint-url "$SPACES_ENDPOINT" s3 rm "s3://${SPACES_BUCKET}/${PREFIX}/${KEY}"
    fi
  done
  echo "[backup] done"
}

if [ "${1:-}" = "--once" ]; then
  run_backup
  exit 0
fi

# Loop: run daily at ~02:00 Asia/Manila (18:00 UTC)
while true; do
  NOW="$(date -u +%H%M)"
  if [ "$NOW" = "1800" ]; then
    run_backup || echo "[backup] FAILED"
    sleep 61
  fi
  sleep 30
done
