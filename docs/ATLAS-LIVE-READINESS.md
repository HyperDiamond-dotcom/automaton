# Atlas LIVE connection preflight — read-only

This standalone tool verifies a **separate Trading 212 LIVE account** using three HTTPS GET requests: account summary, open positions, pending orders. It cannot create, alter or cancel orders, and does not claim the strategy is safe or profitable.

## Setup

1. Revoke and replace API credentials stored in Railway before the October 2026 security incident, following Railway's published guidance.
2. If Trading 212 supports it on your account, create separate **read-only LIVE** API credentials (not the DEMO keys), with the least privileges available. Do not grant order-placement scope for this check.
3. Keep the credentials only in a private, appropriately scoped secret manager or environment variables `T212_LIVE_API_KEY` and `T212_LIVE_API_SECRET`. Never paste secrets into GitHub, ChatGPT, pull requests or logs.
4. In a secured Node.js 22+ environment run `node ops/atlas-live-preflight.mjs`. The result prints connectivity and position/order counts only, not balances or credential values.

## Safety gates still required before any order-capable LIVE system

- Resolve four unsafe council approvals reported by the deployed scanner.
- Match the demo broker's order fills, pending orders and positions against the persistent Atlas journal. A submitted order with no confirmed fill is unresolved, not a successful trade.
- Resolve GOOGL stop-threshold risk and test protective-order creation, coverage, rejection and failure recovery.
- The deployed scanner lives on Railway's persistent volume at `/root/.automaton/start-atlas-v2.sh`; this branch does **not** alter it.
- Demonstrate idempotency across retries and restarts; fail closed on stale data, market closure, network outages, duplicate orders and unexpected exposure.
- Verify maximum exposure, position sizing, daily drawdown, emergency kill switch, and provider-side key isolation.
- Independently review strategy paper performance net of realistic spread, execution and fees. Profitability remains unproven.

Never repoint the existing DEMO-only bridge directly at LIVE. Turning on live-money execution requires separate code, security validation and an explicit decision on risk capital.

Railway security information: https://blog.railway.com/p/security-disclosure-wednesday-october-21st

No credentials are contained in this branch.
