import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './atlas-intraday-strength.mjs';
test('distinguishes a rally near its high, a faded rally, stale data and a closed session', () => {
  const result = { meta: { symbol:'ANT', currency:'USD', instrumentType:'EQUITY', regularMarketTime:1600,
    currentTradingPeriod:{regular:{start:1000,end:3000}} }, timestamp:[1000,1300],
    indicators:{quote:[{open:[100,105], high:[105,107], close:[104,106.5], volume:[1000,1800]}]} };
  const read = now => classify({chart:{result:[result]}}, 'ANT', now).status;
  assert.equal(read(1601),'STRENGTH');
  result.indicators.quote[0].close[1]=102;
  assert.equal(read(1601),'RALLY_FADING');
  assert.equal(read(2800),'AWAITING_FRESH_BARS');
  assert.equal(read(4000),'SESSION_CLOSED');
});
