# Atlas copy-trading: paper-only preparation

**NOT LIVE:** no real-money execution, no broker API calls, no live trader signal feed and no proven profitability. Existing Atlas stock/crypto monitors and Trading 212 auditing are unchanged.

Run local tests: \`node --test atlas-copy-paper.test.mjs\`.

Safeguards:
- Both \`ATLAS_COPY_MODE=PAPER\` and \`ATLAS_COPY_KILL_SWITCH=OFF\` must be explicitly set to simulate. Default kill switch is ON. Even when OFF there is **no real-money execution path**.
- GBP-priced spot-only allowlisted instruments; no leverage or shorting.
- Max 2% per paper entry, max 5% NAV per copied trader, max 15% total invested, max 5% initial daily NAV in new entries.
- New buys are blocked after 2% paper daily drawdown, 10% all-time peak drawdown, stale mark (>15min), or duplicated / stale (>15min) signals. Sells may reduce risk.
- Assumes 0.1% synthetic fee and does NOT model FX/slippage/taxes.
- Requires local signal JSON and ledger files under an isolated persistent /mnt/atlas-copy/ volume (single writer only). Without configured feed / ledger, it logs WAITING_FOR_APPROVED_SIGNAL_SOURCE_AND_LEDGER.
- Does not trust names / claims in signals as authentication; authenticate the actual source in a separately reviewed provider adapter.

Future work: research a UK-authorised and compatible provider; verify trader results, permissioned access and data rights; implement signed/authenticated signal ingestion with observed quote validation, persistence, deduplication, monitoring and benchmarking. Live-money integration would require separate code/design/consent, not a flip of this switch.

Trading 212 Social Pies are NOT automatic event-by-event copying: updates require user review. Trading 212's API is in beta and has Invest/ISA restrictions. FCA guidance on fully automated copy trading raises portfolio-management regulatory considerations.