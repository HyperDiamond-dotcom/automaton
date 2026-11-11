# Atlas multi-agent council — simulation-only

This is a **five-role deterministic multi-agent approval system**. The reviewers are separate rule-based modules, not independent paid LLM instances, and no reviewer has shell, wallet, Railway, Trading 212 or cryptocurrency exchange trading credentials.

| Reviewer | Job | Hard veto |
|---|---|---|
| Market data | Check quotes, spread, completed contiguous candles | Stale, malformed or missing bars |
| Market research | Examine the preceding 24×15-minute momentum and quote gap | Momentum below +2.5%, >2% gap |
| Strategy | Require the SMA20/50 upward crossing | Not a BUY or missing bullish confirmation |
| Risk | Verify cash, exposure, existing position and drawdown | Halted, oversize or unmarked position |
| Evidence | Independently examine the existing paper-fill ledger | Any missing, corrupt or non-simulated fill |

All five must approve a **new paper-only buy**. Disapprovals are logged as explicit veto reasons in the simulated portfolio state, and returned in each scan's decision object. Existing simulated positions can still be sold at a stop/take-profit or on the global drawdown halt: the council cannot veto risk exits. Its activity is bounded and deterministic with **no inference costs**. History is retained for the latest 5,000 decision events, while paper fill logs are retained separately.

This is **not** a profitable strategy by itself. The market-research agent uses observed momentum as a filter, not a forecast. Re-run backtests before relying on the changes. Do not equate a council vote with a live order, a broker-confirmed fill, or an independent AI opinion.

**Existing Railway stock trading council is different.** That council's prior four unsafe approvals remain unresolved on the Railway persistent volume and are not repaired by this crypto module. No live crypto trading permission is added.
