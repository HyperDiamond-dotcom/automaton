# JJ Simon / Fair Pricing Theory — NQ historical research only

Two independently tracked **hypothetical** 1-minute backtests: (1) **opening continuation**, (2) **return to fair-price reversion**. This is a *strictly defined research interpretation* of public descriptions, not JJ's personal live execution engine and not a claim to replicate his results.

Sources: [Chart Fanatics strategy explanation](https://www.chartfanatics.com/strategies/fair-pricing-theory-strategy); [JJ Simon strategy at FX Replay](https://fxreplay-webflow.fxreplay.app/strategies/jj-simons-fair-value-theory-nq-strategy). These descriptions contain discretionary elements (obvious market structure, news repricing, changes in fair value) that cannot be precisely replicated by a simple script.

## Data and verification
- Public third-party [kfccolonel1/BARS](https://github.com/kfccolonel1/BARS) **2026 stitched one-minute NQ dataset**, America/New_York ISO offsets. Independent vendor provenance, licensing and contract-roll adjustments are **unverified**. Dataset ends 8 October 2026, not live.
- GitHub Actions runs the **offline unit tests** on push. Trigger the workflow manually (Actions > JJ Simon NQ research > Run workflow) to download the historical dataset and produce a JSON report artifact. Only manually dispatched historical runs fetch external data.
- Local: \`node --test research/jj-simon/*.test.mjs\` then \`node research/jj-simon/engine.mjs /path/to/authorised-NQ-minute.csv report.json\`.
- **Pre-declared period split:** development Jan–Jun 2026, held-out July–8 Oct 2026. All rules locked before viewing outcomes. Historical holdout is not live forward testing.

## Rules and limits
- Only 9:30–11:00 and 14:00–15:00 New York time. Fair-price anchor is first bar's **open** in each session. This is a simplifying rule: genuine pre-event prices may differ, especially on news days.
- **Continuation**: opening 15 minutes only; move away from anchor; five-bar break of structure PLUS larger, opposing prior-candle displacement, fully confirmed at bar close. Enter **next minute open**.
- **Reversion**: after first 15 minutes; move >= one 14-bar ATR from anchor and confirmed five-bar reversal break plus opposite-candle displacement toward anchor. Conservative target is nearer of fair-price anchor and 1.5 R; skip reward below 0.75 R.
- Stops: 1.25 ATR (minimum 2 NQ points), target 1.5R continuation, stop-first if a one-minute candle touches both. No position held past each session. Gaps can invalidate sessions. No scheduled-news logic or volume lookahead.
- **Financial modelling**: **one MNQ** contract on NQ historical prices (proxy, not actual MNQ fill tape), $2 per index point, assumed $1.50 fees per side, 0.25-point slippage per side. 0.5% risk budget per trade on fictional $25,000 balance; one concurrent position per strategy; max four trades per session, 1% daily realised loss limit, global 5% drawdown halt, stop reversion after three consecutive reversion losses each session.
- Reports give separate trades, P&L, win rate, realised maximum drawdown, and fee scenario for both halves. **No real orders, no broker APIs, no prop firm accounts, no credentials, no models or recurring Railway service.**
- Major limitations: retrospective optimization bias even with a holdout; third-party data and potential roll jumps; 1-minute OHLC cannot determine intrabar sequencing; ATR and structure definitions are our own test choices; simulated slippage and fees not independently verified; daily/calendar gaps and news not fully accounted for. Results are not a prediction of future profitability. A positive sample is insufficient for risking money.

## Next validation gate
Verify sample integrity and historical results first, then perform walk-forward tests across other years and a genuine live-data **paper-only** observation period. Do not merge this into Atlas's operational trading code or enable live trading unless reviewed separately.
