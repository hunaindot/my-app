#!/bin/bash
# update_data.sh
# Full data update pipeline: regenerate all static files and sync to git.
# Run from the scripts/ directory with your .env present.
#
# Usage: bash update_data.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo "=== Step 1: Regenerate static files ==="
cd "$SCRIPT_DIR"

# Prefer real parquet if present; fall back to mock otherwise
PARQUET="$(ls "$ROOT"/data/*.parq* 2>/dev/null | head -n 1)"
if [ -n "$PARQUET" ]; then
    echo "Found $PARQUET — running full pipeline"
    python export_arrow.py
    python export_bitmasks.py
    python export_sqlite.py
else
    echo "WARNING: no data/*.parq* found — generating mock data instead"
    python generate_mock_data.py
fi

echo ""
echo "=== Step 2: Sync info.json to api/ ==="
cp "$ROOT/frontend/public/data/info.json" "$ROOT/api/info.json"

echo ""
echo "=== Step 3: Migrate to Supabase ==="
python migrate_to_supabase.py

echo ""
echo "=== Step 4: Clean and re-add bitmasks in git ==="
cd "$ROOT"
git rm -r --cached frontend/public/data/bitmasks/ --quiet
git add frontend/public/data/bitmasks/
git add frontend/public/data/slim.arrow
git add frontend/public/data/info.json
git add api/info.json

echo ""
echo "=== Step 5: Commit and push ==="
git commit -m "update data"
git push

echo ""
echo "Done. GitHub Actions will redeploy the frontend automatically."
