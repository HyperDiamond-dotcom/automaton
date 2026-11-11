# Atlas stock order reconciliation (DEMO, read-only)

Atlas's existing runtime evidence reports **five submitted buy orders, zero confirmed filled buy orders, and four unsafe council approvals**. These are distinct questions: a submitted order is not a confirmed fill, and a council approval requires a separate signed audit record. This module only addresses order/fill reconciliation; it does not attempt to excuse or clear council-approval failures.

The [Trading 212 official API](https://docs.trading212.com/api/historical-events/orders_1) provides read-only historical orders and an orders endpoint. This code uses **only the demo base URL**, with a hard-coded allowlist of GET endpoints, at most three pages (API history endpoint limited to six requests per minute), and has zero code for order placement.

To run this on a trusted machine with DEMO-only account credentials in environment variables:

```sh
node --test atlas/stock-orders-audit.test.mjs
node atlas/stock-orders-audit.mjs /path/to/your-order-journal.json
```

The journal must contain an array of submitted orders with an exact broker-returned `orderId` (or `brokerOrderId` / `id`) and optional `ticker`. An acceptance log without order IDs cannot be reconciled. The report confirms a fill **only** if broker data has `filledQuantity>0`, and flags unknown or unmatched orders as `UNVERIFIED`. A pending order is not a fill. This tool needs credentials when run but no secrets belong in GitHub.

**Not activated in Railway**: the real Atlas scanner and council rule code live on its persistent volume, not in the tracked GitHub fork. No changes to the existing Railway production stock service have been made. Keep automated order execution disabled until the council review is complete and reconciled evidence can be obtained.
