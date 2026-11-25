# Atlas demo-only broker reconciliation — 23 October 2026
This tool is not installed on the running Railway scanner. It uses **read-only GET** requests to the Trading 212 **DEMO** API only and cannot trade.
Run locally with Node 22+ and **rotated demo-only** T212_API_KEY and T212_API_SECRET provided securely in the environment: `node atlas-demo-audit.mjs`. Never paste secrets into logs, PRs, ChatGPT or the shell command.
It flags missing order-history matches, duplicate pending orders and nominal stop coverage gaps, but cannot attribute fills to Atlas without matching the separate persistent scanner journal. Historic orders may be truncated, and stop orders do not guarantee a fill price. All audit output remains explicitly NOT LIVE READY.
The Railway service executes a persistent-volume script (/root/.automaton/start-atlas-v2.sh), so this GitHub branch does not fix the running scanner. Railway's 21 October security disclosure requires credential rotation as a precaution before order-capable deployments: https://blog.railway.com/p/security-disclosure-wednesday-october-21st
Before live trading: eliminate unsafe council approvals, independently reconcile broker events with Atlas journal, test order idempotency, kill switch, market-hour/stale-price checks, hard risk limits, protective order lifecycle and paper-trading profitability. Explicit separate go-live authorization is required.

## Rate-limit hardening (23 October)
Historical orders are limited to three 50-order pages per execution, with 11 seconds between page requests. A partial history is always flagged, not interpreted as a full reconciliation. DEMO calls are GET-only and reject live endpoints, cross-origin redirects, URL credentials, duplicate cursor keys, and page sizes above 50. The associated tests use mock credentials and never place orders.

Trading 212 API: https://docs.trading212.com/api
