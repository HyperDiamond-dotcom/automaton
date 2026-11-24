# Atlas research acceleration: proposed architecture (not deployed)

Use a research-only pipeline: Scout (public ideas and sources) -> Data validator (provenance, session calendar, completeness) -> Backtester (fixed assumptions, chronological split) -> Skeptic (cost stress, comparison, sample size, leakage) -> Review (human evidence and independent reproduction). Keep the existing risk and execution layer separate. Research workers must have no broker keys, deployment credentials, ability to authorize live trading, or ability to spend money. No self-replication, automatic package installation or execution of untrusted agent code.

## Framework shortlist

- Microsoft RD-Agent (https://github.com/microsoft/RD-Agent): autonomous hypothesis/development loops; promising, but isolate generated code and estimate inference and compute cost before trial.
- Microsoft Qlib (https://github.com/microsoft/qlib): quantitative datasets, ML experiments and evaluation. Consider for cross-sectional equity research later; check intraday data suitability.
- VectorBT (https://github.com/polakowo/vectorbt): independent research engine and fast parameter studies; use fixed held-out tests and account for multiple comparisons. Check licensing before adoption.
- FinRobot (https://github.com/AI4Finance-Foundation/FinRobot): specialist research and debate patterns; may require API credentials and paid data. Adopt role separation before adding dependencies.

None installed or integrated. Do not grant any candidate broker access. No paid accounts or services authorized.

## New evidence gate
Run node research/atlas-evidence-gate.mjs --self-test. Or pass a local JSON file with report (output of the evaluator) and evidence fields: kind, source, datasetSha256, calendarVerified, splitFrozenBeforeEvaluation, strategyRulesVerified, costModelVerified, independentReview. Attestations require real human checks; the gate cannot authenticate them. Provisional review screen: >=60 sessions each side, >=30 later trades, positive later return and doubled-friction return, beat price-only buy-and-hold, <=10% estimated drawdown in both later scenarios. These are screening heuristics, not statistical proof or live approval; no tuning to pass them. Gate always returns liveTradingAuthorized=false. Nine synthetic assertions passed in JavaScript function evaluation, not full Node/CI.

## Data and test blockers
FirstRate free samples currently advertise two weeks, 21 Sep–2 Oct 2026 (https://firstratedata.com/free-intraday-data), inadequate for the proposed sample threshold. Marilux lists a free recent minute-data month (https://marilux.dev/en/data/QQQ); license, history and download must be checked. Do not combine incompatible feeds or treat tiny samples as profitability evidence. No historical prices obtained. No PR workflow runs returned for prior head 69f62bc; direct raw download from local runtime failed DNS. Full Node and CI validation remain outstanding. PR #17 is a distinct draft for production safety; do not merge it or apply staged Railway changes as part of this research.

Next: independently verify source strategy rules; obtain legitimate longer history and session calendar; evaluate locked rules; validate actual UK invest instrument and friction; independently reproduce results. No deployment, changes to production or order submission.
