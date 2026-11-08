#!/usr/bin/env bash
# Applies the migration + seed to a throwaway local PostgreSQL and runs the
# business-rule tests. Needs PostgreSQL 15+ binaries (initdb, pg_ctl, psql).
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
DIR="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DIR"
  RUN_AS="runuser -u postgres --"
fi
cleanup() { $RUN_AS pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

$RUN_AS initdb -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN_AS pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null

PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/stub_supabase.sql
"${PSQL[@]}" -f supabase/migrations/20261108000000_init.sql
"${PSQL[@]}" -f supabase/seed.sql
"${PSQL[@]}" -c "select count(*) as demo_tasks from public.tasks where is_demo" -t | xargs echo "demo tasks seeded:"
"${PSQL[@]}" -c "delete from public.tasks where is_demo"
"${PSQL[@]}" -o /dev/null -f supabase/tests/business_rules.sql 2>&1 | sed -n "s/^psql:[^ ]* NOTICE:  /  /p; /passed/p"
