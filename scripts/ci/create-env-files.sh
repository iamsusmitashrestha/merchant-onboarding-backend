#!/usr/bin/env bash
# Builds .env and .env.test from the committed examples, so CI runs with the
# same configuration as local development. Only the three credentials differ:
# throwaway values, generated per run and masked in the GitHub Actions log.
#
# TODO: move to repository settings (Settings → Secrets and variables →
# Actions): DB_PASSWORD, JWT_SECRET and SEED_USER_PASSWORD as Secrets, the
# other keys of .env.test.example as Variables. Read them in a job-level
# `env:` with ${{ secrets.* }} / ${{ vars.* }} and replace this script with a
# check that all are set (an unset one arrives as an empty string).
set -euo pipefail

db_password="$(openssl rand -hex 16)"
jwt_secret="$(openssl rand -hex 32)"
seed_password="$(openssl rand -hex 16)"
for value in "$db_password" "$jwt_secret" "$seed_password"; do
  echo "::add-mask::$value"
done

for env_file in .env .env.test; do
  sed -e "s|^DB_PASSWORD=.*|DB_PASSWORD=${db_password}|" \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" \
      -e "s|^SEED_USER_PASSWORD=.*|SEED_USER_PASSWORD=${seed_password}|" \
      "${env_file}.example" > "$env_file"
done
