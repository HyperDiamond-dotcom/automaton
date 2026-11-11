# Heikin-Ashi, Donchian and momentum research (Atlas — NO EXECUTION)

**Latest tested evidence:** [EVIDENCE-2026-10-20.md](EVIDENCE-2026-10-20.md).

The recommended, risk-sized experiment is `etf-study.mjs`, comparing Heikin-Ashi, Donchian 20/10 and 252-day monthly momentum on **five US-listed ETFs**, each with fictional $5,000 cash per study. Prices are original Yahoo Finance daily OHLC and fills are next-day real prices; Heikin-Ashi is never treated as executable price data.

To rerun (requires Node >=20 and internet for Yahoo historical chart data):

```bash
node --check research/trend-candidates/etf-study.mjs
node --test research/trend-candidates/*.test.mjs
node research/trend-candidates/etf-study.mjs etf-report.json
```

`study.mjs` is a **separate exploratory NQ futures prototype**; its single-contract risk is too high to support decision-grade conclusions; **do not use its P&L for trades**. Raw unadjusted futures contract roll jumps complicate any long-horizon result.

No live execution functions, API keys, exchanges, broker integrations, paid API subscriptions or Railway changes. Paper research only. Never claim profits are guaranteed.
