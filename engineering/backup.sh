#!/bin/bash
set -euo pipefail
umask 077
cd /opt/windforge
dir=$(mktemp -d)
trap 'rm -f "$dir/db.gpg"; rmdir "$dir"' EXIT
# Only the public encryption key lives on this host.
runuser -u postgres -- pg_dump --format=custom windforge | gpg --batch --trust-model always --recipient-file /etc/windforge-backup.asc --encrypt --output "$dir/db.gpg"
test "$(stat -c %s "$dir/db.gpg")" -le 12000000 || { echo "Backup exceeded 12 MB storage policy"; exit 1; }
curl --fail --silent --show-error --retry 2 --max-time 100 --config /etc/windforge-backup-curl.conf --request PUT --data-binary "@$dir/db.gpg" https://windforge-knowledge-link.khmer-iq.workers.dev/backup
