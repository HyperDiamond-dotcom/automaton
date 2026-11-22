import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { submitApprovedLimit } from './atlas-live-order.mjs';

test('live approvals are account-bound, time-limited and survive an ambiguous POST', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-orders-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { T212_LIVE_API_KEY: 'fixture', T212_LIVE_API_SECRET: 'fixture', ATLAS_LIVE_JOURNAL_DIR: dir };
  const intent = { id: 'order1', accountId: '123', ticker: 'TEST_EQ', quantity: -0.5, limitPrice: 10, expiresAt: new Date(Date.now()+60000).toISOString() };
  let posts = 0;
  async function broker(url, options) {
    assert.equal(new URL(url).hostname, 'live.trading212.com');
    if (url.endsWith('/positions')) return Response.json([{ instrument: { ticker: 'TEST_EQ' }, quantityAvailableForTrading: 1 }]);
    if (options.method !== 'POST') return Response.json({ id: 123 });
    posts++;
    assert.deepEqual(JSON.parse(options.body), { ticker: 'TEST_EQ', quantity: -0.5, limitPrice: 10, timeValidity: 'DAY' });
    if (posts === 1) throw Error('connection lost');
    return Response.json({ id: 17, status: 'NEW' });
  }
  const run = changes => submitApprovedLimit({ ...intent, ...changes }, env, broker);
  await assert.rejects(run({ accountId: '321' }), /verification failed/);
  await assert.rejects(run({ id: 'expired', expiresAt: new Date(0).toISOString() }), /expired/);
  await assert.rejects(run({ quantity: 1 }), /Invalid/);
  await assert.rejects(run({ quantity: -2 }), /Insufficient/);
  assert.equal(posts, 0);
  await assert.rejects(run({}), /connection lost/);
  await assert.rejects(run({}), { code: 'EEXIST' });
  assert.equal(posts, 1);
  const results = await Promise.allSettled([run({ id: 'order2' }), run({ id: 'order2' })]);
  assert.equal(results.filter(r => r.value?.brokerOrderId === 17).length, 1);
  assert.equal(posts, 2);
});
