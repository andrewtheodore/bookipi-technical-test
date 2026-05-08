#!/bin/bash
# Run all stress tests sequentially, resetting the database between each run.
# Prerequisites: Docker, backend (port 3000), and k6 must be running/installed.

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

reset_db() {
  echo ""
  echo "--- Resetting database and cache ---"
  docker exec flash-sale-postgres psql -U flashsale -q -c \
    "DELETE FROM orders; UPDATE products SET stock = 100; UPDATE sale_config SET start_time = NOW(), end_time = NOW() + INTERVAL '1 hour';"
  # Sync Redis via the status endpoint (ensures cache matches DB)
  curl -s "$BASE_URL/api/sale/status" > /dev/null
  docker exec flash-sale-redis redis-cli DEL flash_sale:purchased_users > /dev/null
  echo "--- Reset complete ---"
  echo ""
}

echo "========================================"
echo "  Running All Stress Tests"
echo "========================================"

# 1. Flash Sale
reset_db
echo ">>> Test 1/5: Flash Sale (500 users, 100 stock)"
k6 run "$SCRIPT_DIR/flash-sale.k6.js"

# 2. Duplicate Purchase
reset_db
echo ">>> Test 2/5: Duplicate Purchase (same user 50x)"
k6 run "$SCRIPT_DIR/duplicate-purchase.k6.js"

# 3. Ramp-Up
reset_db
echo ">>> Test 3/5: Ramp-Up (50 → 1000 VUs)"
k6 run "$SCRIPT_DIR/ramp-up.k6.js"

# 4. Sale Status
reset_db
echo ">>> Test 4/5: Sale Status Endpoint (200 VUs, 30s)"
k6 run "$SCRIPT_DIR/sale-status.k6.js"

# 5. Mixed Traffic
reset_db
echo ">>> Test 5/5: Mixed Traffic (300 VUs, 30s)"
k6 run "$SCRIPT_DIR/mixed-traffic.k6.js"

echo ""
echo "========================================"
echo "  All Stress Tests Complete"
echo "========================================"
