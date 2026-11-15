#!/bin/sh
# Run as root on the designated Ubuntu host, after transferring service files to /opt/windforge.
set -eu
cd /opt/windforge
test "$(id -u)" = 0
test "$(runuser -u postgres -- psql -Atc 'show listen_addresses')" = localhost
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -tAc "select 1 from pg_roles where rolname='windforge'" | grep -q 1 || runuser -u postgres -- createuser --no-superuser --no-createdb --no-createrole windforge
runuser -u postgres -- psql -Atc "select 1 from pg_database where datname='windforge'" | grep -q 1 || runuser -u postgres -- createdb windforge
runuser -u postgres -- psql -d windforge -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS vector'
runuser -u postgres -- psql -d windforge -v ON_ERROR_STOP=1 -f 001.sql
runuser -u postgres -- psql -d windforge -v ON_ERROR_STOP=1 -f 002.sql
runuser -u postgres -- psql -d windforge -v ON_ERROR_STOP=1 -f 003.sql
runuser -u postgres -- psql -d windforge -v ON_ERROR_STOP=1 -c 'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT SELECT ON active,releases,source,turbine,component,evidence,ingestion TO windforge; GRANT SELECT,INSERT,UPDATE,DELETE ON quota,work TO windforge;'
OPENBLAS_NUM_THREADS=1 runuser -u postgres -- /opt/windforge/venv/bin/python load.py catalogue.json
if ! test -f /etc/windforge.env; then
 umask 077
 { echo WF_RELAY=wss://windforge-knowledge-link.khmer-iq.workers.dev/connect; printf 'WF_KEY='; openssl rand -hex 32; } > /etc/windforge.env
fi
install -m 644 windforge-knowledge.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now windforge-knowledge
systemctl restart windforge-knowledge
