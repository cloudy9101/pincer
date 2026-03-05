#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Pincer Gateway — one-time Cloudflare resource provisioning
#
# Run this script once after `wrangler login` to create all the Cloudflare
# infrastructure that Pincer needs (D1, KV, R2, Vectorize).
#
# Usage:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh
#
# After it finishes, copy the IDs it prints into wrangler.toml, then run:
#   wrangler d1 migrations apply pincer-db --remote
#   bun run deploy
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

CYAN='\033[0;36m'; BOLD='\033[1m'; GREEN='\033[0;32m'; RESET='\033[0m'
step() { echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"; }
ok()   { echo -e "${GREEN}✔ $*${RESET}"; }

step "Checking Wrangler authentication"
wrangler whoami
ok "Authenticated"

# ── D1 Database ───────────────────────────────────────────────────────────────
step "Creating D1 database: pincer-db"
D1_OUTPUT=$(wrangler d1 create pincer-db 2>&1)
echo "$D1_OUTPUT"
D1_ID=$(echo "$D1_OUTPUT" | grep 'database_id' | head -1 | sed 's/.*= *"\(.*\)".*/\1/')
ok "D1 database_id: $D1_ID"

# ── KV Namespace ──────────────────────────────────────────────────────────────
step "Creating KV namespace: CACHE"
KV_OUTPUT=$(wrangler kv namespace create CACHE 2>&1)
echo "$KV_OUTPUT"
KV_ID=$(echo "$KV_OUTPUT" | grep '^\s*id' | head -1 | sed 's/.*= *"\(.*\)".*/\1/')
ok "KV namespace id: $KV_ID"

# ── R2 Bucket ────────────────────────────────────────────────────────────────
step "Creating R2 bucket: pincer-media"
wrangler r2 bucket create pincer-media
ok "R2 bucket created"

# ── Vectorize Index ───────────────────────────────────────────────────────────
step "Creating Vectorize index: pincer-memory"
wrangler vectorize create pincer-memory --dimensions=1536 --metric=cosine
ok "Vectorize index created"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}────────────────────────────────────────────────────────────────${RESET}"
echo -e "${BOLD}Setup complete. Paste these values into wrangler.toml:${RESET}"
echo ""
echo "  [[d1_databases]]"
echo "  database_id = \"$D1_ID\""
echo ""
echo "  [[kv_namespaces]]"
echo "  id = \"$KV_ID\""
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo "  1. Update wrangler.toml with the IDs above"
echo "  2. Apply database migrations:"
echo "       wrangler d1 migrations apply pincer-db --remote"
echo "  3. Set required secrets (see .dev.vars.example for the full list):"
echo "       wrangler secret put ADMIN_AUTH_TOKEN"
echo "       wrangler secret put ENCRYPTION_KEY"
echo "       wrangler secret put TELEGRAM_BOT_TOKEN"
echo "       wrangler secret put TELEGRAM_WEBHOOK_SECRET"
echo "  4. Build and deploy:"
echo "       bun install && cd admin && bun install && cd .."
echo "       bun run deploy"
echo -e "${BOLD}────────────────────────────────────────────────────────────────${RESET}"
