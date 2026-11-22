# Atlas live switch

In Railway, open the production service **atlas-broker-risk-audit → Variables**. Set **ATLAS_MODE** to **PREVIEW** to scan without sending orders. To enable order submission, set it to **LIVE** and deploy the variable change. The next scheduled scan can submit one real DAY limit order. Changing back to PREVIEW stops new submissions once the new deployment takes over. Inspect outstanding orders separately in Trading 212.

## One-time setup

- Set **ATLAS_POT_GBP** to the GBP cash specifically allocated to Atlas, without a pound sign. The seed must be available on the first live run. Subsequent sizing uses the strategy's own cash and market value. Altering the seed after initialisation blocks execution pending reconciliation.
- Mount a persistent Railway volume on the service (for example at **/data**). The executor uses Railway's mount path. Preserve the journal when moving deployments. Never replace or delete a live journal to clear an error.
- The connected GBP account needs permission to read positions, pending orders and order history, and to place orders. Keep credentials in the existing Railway secrets. The first live run binds the journal to that account and excludes its existing holdings.

## Behaviour

Atlas considers fresh strength on the live market scan. It sizes a new position at up to 5% of the dedicated pot and limits purchases to 20% aggregate exposure, using the latest valuation, available cash and a 2% cost and FX allowance. It can submit at most one order per scan. Exchange rates, charges and later price moves can change actual exposure. Delayed signals remain research-only. Fresh FX is required for foreign-currency orders.

Atlas gives profitable sales priority and may sell a quarter of an Atlas holding once during a rally, rounded down to four decimal places. Its limit price must cover the broker's recorded cost basis with the 2% allowance. Actual net proceeds are known after execution. A confirmed fade or a return to within 1% above the opening-bar close re-arms the signal. Missing or delayed observations do not reset it. The strategy has no automatic loss exit.

Monitor **atlas_wealth_execution** in Railway logs. BROKER_ACKNOWLEDGED means the broker accepted an order. AWAITING_FILL means an order remains open. Only confirmed fills update the journal. After a timeout, inspect the broker's order history and reconcile the journal before resuming. A process crash can leave atlas-wealth.lock on disk. Switch to PREVIEW, ensure the prior worker has stopped, verify broker and journal state, then clear only the stale lock. A journal entry without a broker order ID requires independent reconciliation.
