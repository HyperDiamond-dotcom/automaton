import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCandles } from "./atlas-crypto-core.mjs";

const now = 1_800_000_000_000;
const granularity = 900;
function fixture() {
  const start = Math.floor(now / 1000 / granularity) * granularity - 66 * granularity;
  return Array.from({ length: 66 }, (_, i) => {
    const close = 100 + i * 0.2, open = close - 0.1;
    return [start + i * granularity, open - 1, close + 1, open, close, 100];
  });
}
test("closed candles produce a signal only, never an order", () => {
  const result = analyzeCandles(fixture().reverse(), now, granularity);
  assert.ok(result.candlesUsed >= 50);
  assert.equal(result.ordersSubmitted, 0);
  assert.equal(result.executionAllowed, false);
  assert.ok(["NO_ENTRY", "LONG_WATCH", "NO_ENTRY_HIGH_VOLATILITY"].includes(result.signal));
});
test("rejects stale data", () => {
  assert.throws(() => analyzeCandles(fixture(), now + 7200000, granularity), /stale_market_data/);
});
test("rejects invalid OHLC input", () => {
  const rows = fixture();
  rows[0][1] = -1;
  assert.throws(() => analyzeCandles(rows, now, granularity), /invalid_candle/);
});
test("rejects insufficient data", () => {
  assert.throws(() => analyzeCandles(fixture().slice(0, 5), now, granularity), /insufficient_closed_candles/);
});
