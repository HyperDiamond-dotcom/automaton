# Atlas crypto — PAPER ONLY

This isolated BTC-USD and ETH-USD spot-market simulator uses public Coinbase Exchange data and **never submits real exchange orders**. Do not supply exchange API keys; no private API is implemented.

## Verification
Run: node --test atlas/crypto-paper.test.mjs
Run once (locally, with network access): ATLAS_CRYPTO_MODE=PAPER node atlas/crypto-paper.mjs once
Run loop: ATLAS_CRYPTO_MODE=PAPER node atlas/crypto-paper.mjs run

Default virtual balance: $5,000. State persisted by default in ./atlas-crypto-paper-state.json (override ATLAS_CRYPTO_STATE for a persistent mounted volume). At startup a lock file is created; if the process crashes, remove the stale lock manually only after checking that no copy remains active.

The simulator evaluates completed 15-minute bars using 20/50 simple-moving-average crossovers, and uses publicly supplied exchange tickers as simulated execution quotes. All prices must be current and sensible. It enforces 10% maximum single-entry budget, 20% total exposure, a simulated 3% stop and 6% take-profit, and a portfolio-level 5% drawdown halt with a persistent stopped state. Fees and slippage are approximated at 0.6% and 0.1% per side respectively.

**No live deployment has been made.** Railway's deployed startup program lives on a persistent volume under /root/.automaton/start-atlas-v2.sh and its GitHub watchPaths currently only cover /packages/cli/**. Merging this branch does not start the crypto process. Integrate only after a separate review of the runtime script and the council approval/order reconciliation issues affecting existing paper stock trades.

**Not demonstrated profitable:** These are simple experimental signals. Fees, spreads, latency, outages and gapping may cause much worse actual returns. Paper stops cannot guarantee a fill at the trigger price. 24/7 crypto trading is particularly volatile; the simulated $5,000 is not a recommended live allocation.
