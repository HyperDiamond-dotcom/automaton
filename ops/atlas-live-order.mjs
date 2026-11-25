// Run once with an explicitly approved limit order. Never schedule the broker audit as an executor.
import { open, stat } from 'node:fs/promises';
import { resolve, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = 'https://live.trading212.com/api/v0/equity';
export async function submitApprovedLimit(intent, env, transport = fetch) {
  if (env.ATLAS_MODE !== 'LIVE') throw Error('Live execution is off');
  const { id, accountId, ticker, quantity, limitPrice, expiresAt } = intent;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) ||
      typeof accountId !== 'string' || !/^\d+$/.test(accountId) ||
      typeof ticker !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(ticker) ||
      !Number.isFinite(quantity) || quantity >= 0 || !Number.isFinite(limitPrice) || limitPrice <= 0 ||
      !Number.isFinite(Date.parse(expiresAt))) throw Error('Invalid approved limit order');
  const dir = env.ATLAS_LIVE_JOURNAL_DIR;
  if (!dir || !isAbsolute(dir) || !(await stat(dir)).isDirectory()) throw Error('Persistent journal directory required');
  if (env.RAILWAY_ENVIRONMENT_ID && (!env.RAILWAY_VOLUME_MOUNT_PATH ||
      resolve(dir) !== resolve(env.RAILWAY_VOLUME_MOUNT_PATH))) throw Error('Set journal to the Railway volume mount');
  if (!env.T212_LIVE_API_KEY || !env.T212_LIVE_API_SECRET) throw Error('Live broker credentials required');
  const auth = Buffer.from(env.T212_LIVE_API_KEY + ':' + env.T212_LIVE_API_SECRET).toString('base64');
  const headers = { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' };
  const options = () => ({ headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const summary = await transport(base + '/account/summary', options());
  if (!summary.ok || String((await summary.json()).id) !== accountId) throw Error('Live account verification failed');
  const positions = await transport(base + '/positions', options());
  if (!positions.ok) throw Error('Live holdings unavailable');
  const holdings = await positions.json();
  const holding = holdings.find(p => p.instrument?.ticker === ticker);
  if (!Number.isFinite(holding?.quantityAvailableForTrading) ||
      holding.quantityAvailableForTrading < -quantity) throw Error('Insufficient available shares');
  const body = { ticker, quantity, limitPrice, timeValidity: 'DAY' };
  // Exclusive creation reserves the approval across processes and restarts. An uncertain POST stays reserved.
  const file = await open(join(dir, id + '.jsonl'), 'ax', 0o600);
  try {
    await file.writeFile(JSON.stringify({ state: 'reserved', id, accountId, body, expiresAt }) + '\n');
    await file.sync();
    const directory = await open(dir, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    if (Date.now() >= Date.parse(expiresAt)) throw Error('Order approval expired');
    const response = await transport(base + '/orders/limit', { ...options(), method: 'POST', body: JSON.stringify(body) });
    if (!response.ok) throw Error('Broker returned HTTP ' + response.status + '. Check order history before further action.');
    const order = await response.json();
    if (!Number.isSafeInteger(order?.id) || order.id <= 0) throw Error('Missing broker order ID. Check order history.');
    const result = { state: 'acknowledged', brokerOrderId: order.id, status: order.status };
    await file.writeFile(JSON.stringify(result) + '\n');
    await file.sync();
    return result;
  } finally { await file.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const intent = JSON.parse(process.env.ATLAS_APPROVED_LIVE_ORDER);
    console.log(JSON.stringify(await submitApprovedLimit(intent, process.env)));
  } catch (error) {
    console.error(error.code === 'EEXIST' ? 'This approval was already reserved. Check broker history.' : error.message);
    process.exitCode = 1;
  }
}
