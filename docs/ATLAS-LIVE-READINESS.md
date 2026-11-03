# Atlas operational evidence — 26 October 2026

## Confirmed Railway crypto recovery
- The existing `atlas-crypto-paper` service's earlier skipped deployment was repaired by reconnecting its GitHub source to branch `atlas/crypto-paper-20261022`.
- Railway deployment `18271512-a25b-41e3-9741-f09b53654c55` reached **SUCCESS** at **2026-10-26 14:32:22 UTC**.
- Railway's first scheduled cron execution **succeeded** at **2026-10-26 14:33:46 UTC**. Runtime logs confirmed valid BTC-USD and ETH-USD public Coinbase candles, both `status: OK` and `signal: NO_ENTRY`.
- Both signals recorded `ordersSubmitted: 0`, `executionAllowed: false`. No crypto keys, wallet or real-money order path were added.
- Separately verified the branch's crypto syntax and fail-closed unit suite in isolated Node.js: **6/6 passing**. This is **not** a claim of GitHub Actions success for the latest commit.
- This verifies the **first** real scan only, not multiple forward-running cycles, trading profitability or order execution. Existing 15-minute cron should be evaluated over more cycles for reliability and quality.

## Stock Atlas and live activation blockers remain
- Main Railway service remains online, verifying Trading 212 DEMO and scanning positions on its persistent Railway volume.
- Its own evidence continues to report four unsafe council approvals, no independently confirmed buy fills, and an unresolved review-only position risk alert. Stock auto-execution remains off.
- Existing GitHub source changes alone **cannot replace** `/root/.automaton/start-atlas-v2.sh` or the installed council on the persistent volume.
- Before any order-capable deployment: rotate credentials as a precaution following Railway's 21 October security disclosure; recover and audit the installed council code; reconcile exact broker order IDs, fills, open orders and stop coverage; enforce independently verified fail-closed risk limits, kill switch, duplicate protection and cost-aware forward evaluation.
- The old staged main-service apt-package variable remains **uncommitted**. No live-money trading approval has been given.

---

## Historical 22 October checkpoint (superseded where deployment status differs)

# Atlas deployment gate — 22 October 2026

## Current known facts
- Main Automaton Railway service: online; scanner reads Trading 212 **DEMO**.
- Main scanner reports AAPL, MSFT, GOOGL positions; confirms API checks.
- Evidence reports include `confirmedFilledBuyOrders: 0`, `unsafeCouncilApprovals: 4`, and GOOGL below a review-only stop threshold. These must not be interpreted as profitability.
- Scanner runs from a script under persistent Railway volume `/root/.automaton/start-atlas-v2.sh`, so GitHub commits alone do not replace that volume script.
- A historical staged `RAILPACK_DEPLOY_APT_PACKAGES` change exists on the main service. Do not accept it without reviewing its effect.

## Crypto pilot
- `atlas-crypto-scan.mjs` is public market data only, BTC-USD and ETH-USD, closed 15-minute candles.
- Computes EMA(12), EMA(26), 20-candle breakout watch, and ATR(14).
- Fail-closed on malformed, missing or stale candles. Outputs only READ_ONLY_PAPER_SIGNALS, no paper fills, no real orders, no API keys.
- Run: `node --test atlas-crypto-core.test.mjs` and `node atlas-crypto-scan.mjs`.
- Deployment: dedicated Railway cron service every 15 minutes. Don't place the scanner on a 24/7 always-on service unnecessarily.

## Required before any live-money activation
1. Eliminate all unsafe council approvals and demonstrate hard rejection in tests.
2. Broker order lifecycle reconciliation: submitted, accepted, filled, partial fill, rejected, cancelled.
3. Reconcile existing positions, cash, order IDs and duplicates after restarts.
4. Add independent max position, max notional, daily loss, stale quote, market-hours and kill-switch guards.
5. Establish an auditable rolling paper-trading performance sample, including fees/slippage/drawdowns.
6. Review and deliberately authorize a fixed small live-money limit in a separate step.
7. Keep the crypto monitor isolated from any order execution or wallet withdrawal permissions.

## Railway security incident (21 October 2026): deployment blocker

Railway disclosed potential exposure of environment variables, including decrypted secrets in a subset of accounts.
Official disclosure: https://blog.railway.com/p/security-disclosure-wednesday-october-21st

The existing stock service includes variable names for broker and AI/data-access credentials.
No proof this particular account was accessed. Nonetheless treat the existing Railway-stored keys as potentially compromised.

**Do not deploy or enable any production order path until ALL credentials are rotated at their issuing provider:**
- Trading 212 DEMO API key and secret (revoke old key; issue demo-only replacements).
- OpenAI API key (revoke old one, review project usage/billing, issue scoped replacement with budget).
- Twelve Data API key (revoke/regenerate).
- BRIDGE_ACCESS_TOKEN (replace with random token and store securely).
- AUTOMATON_BOOTSTRAP_B64 (review and rotate every embedded secret, not just the encoded value).
- Review any additional credentials in Railway and private registry access.

Railway connector currently returns variable names but redacts secret values. This does not rotate provider-side keys.
Do not post keys in PRs, commits, CI logs, or ChatGPT.
Verify restored Railway build pipeline and successful clean deployment only after secrets have been rotated.
Stock service continues DEMO monitoring, with auto-execution paused. Existing four unsafe council approvals remain unresolved.
Crypto scanner has no secrets and no order path, but its first deployment is still blocked/pending.
