# Atlas opening-bell offline research (prototype)

Tracks issue #18. This is a proposed interpretation, not a verified reproduction of the original video strategy. No network, broker, secrets, scheduled job or deployment integration. Run manually with Node 20+.

## Run

```sh
node research/atlas-opening-bell.mjs --self-test
node research/atlas-opening-bell.mjs sessions.json
```

Input: JSON array of regular full trading sessions, each an array of 78 chronologically ordered five-minute OHLC bars for ONE instrument in ONE consistent currency. Each bar has timestamp (ISO 8601 with timezone, bar OPEN time), open, high, low, close (positive numbers). First timestamp is 09:30 America/New_York, last is 15:55. Supply historical unadjusted, split-consistent data from a legitimate source. Validate dates against the exchange calendar upstream; half-days, holidays, missing bars and data-source adjustments are not handled by this prototype. Missing bars within a supplied day are rejected, omitted whole days are not detectable. No input data included. JSON adapter only; CSV conversion still needed.

## Provisional rules

- Long only; no leverage, integer shares; one filled entry per session. EMA12 and Wilder ATR14 reset every day and warm up for 14 bars. Opening range is first five-minute bar high.
- After warm-up, completed close crosses above opening high and is above EMA12; buy at next bar open plus assumed slippage. No signal from final two bars.
- Initial stop: entry minus 2 ATR (from completed signal bar); trailing stop ratchets upward at completed bar close and is effective next bar. Stop touches fill at stop minus slippage, gaps at open minus slippage. Any surviving position exits at session close.
- Size by smaller of available simulated cash and 0.5% simulated equity risk at initial stop including modeled friction; gaps can exceed the risk target. Default simulated cash 10,000 currency units, 2 bps fee and 5 bps slippage each side, illustrative rather than verified Trading 212 costs. FX, taxes, market impact, liquidity and actual broker stop behavior not modeled.
- Reports trades, net return, approximate drawdown (bar low and close marks, not tick-level), win rate, daily equity. No annualization or benchmark implemented.

## Validation status

Eight deterministic synthetic assertions passed in a JavaScript evaluation of the research functions before upload. The Node CLI wrapper and repository CI have not yet been verified. Synthetic fixtures are not evidence of profitability. No real historical backtest, walk-forward split, benchmark, independently reproduced strategy rules, or market-calendar validation yet. Before further review, obtain licensed historical data, verify the source strategy, fix the input/calendar limitations, compare against a suitable benchmark, run fixed parameters on an untouched out-of-sample period and stress costs and gaps. No live deployment or trading authorization implied.
