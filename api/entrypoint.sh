#!/bin/sh
set -e

if [ ! -f "$DB_PATH" ] && [ -n "$DB_URL" ]; then
  echo "Database not found, downloading from $DB_URL..."
  curl -fsSL "$DB_URL" -o "$DB_PATH"
  echo "Database downloaded."
fi

exec uvicorn main:app --host 0.0.0.0 --port 8000
