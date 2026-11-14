#!/bin/bash
# Keep the Render backend warm 24/7.
# Render free tier gives 750 hours/month (a 31-day month is 744 hours).
set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_URL="${API_URL:-https://patliputratraders.onrender.com/api/health}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-720}" # 12 minutes (prevents Render 15-min idle sleep)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting 24/7 keepalive pings for $API_URL (interval: ${INTERVAL_SECONDS}s)..."

while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$API_URL" || echo "000")
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Ping $API_URL -> HTTP $STATUS"

  # Also keep a local development backend available when this script is run
  # from the repository workstation. Render remains the production target.
  if [[ -d "$SCRIPT_DIR/Backend" ]] && command -v lsof >/dev/null 2>&1 && ! lsof -i :5500 >/dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Local backend on :5500 offline, starting it..."
    (cd "$SCRIPT_DIR/Backend" && npm run start >>/tmp/brush-backend.log 2>&1 &)
  fi

  sleep "$INTERVAL_SECONDS"
done
