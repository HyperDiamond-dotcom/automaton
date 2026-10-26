import test from "node:test";
import assert from "node:assert/strict";
import { livePreflight, readOnlyUrl } from "./atlas-live-preflight.mjs";

test("rejects trading, arbitrary and demo endpoints", () => {
  for (const path of ["/equity/orders/market", "/equity/orders/123", "https://demo.trading212.com/api/v0/equity/positions", "//evil.example/"])
    assert.throws(() => readOnlyUrl(path), /read_only_endpoint_required/);
});

test("checks LIVE via GET only and refuses to enable orders", async () => {
  const calls = [], waits = [];
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method, auth: options.headers.Authorization });
    const body = url.endsWith("/equity/account/summary") ? { id: "redacted" } : [];
    return { ok: true, json: async () => body };
  };
  const report = await livePreflight({key:"test-live-key",secret:"test-live-secret"}, fetcher, async ms => { waits.push(ms); });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.url.startsWith("https://live.trading212.com/api/v0/") && c.method === "GET"));
  assert.deepEqual(waits, [1200, 1200]);
  assert.equal(report.brokerOrderWrites, 0);
  assert.equal(report.liveAutoTradingReady, false);
  assert.equal(report.automaticOrdersEnabled, false);
  assert.ok(!JSON.stringify(report).includes("test-live-"));
});

test("requires distinct LIVE credentials", async () => {
  await assert.rejects(livePreflight({key:"",secret:""}, async () => { throw Error("should not fetch"); }, async () => {}), /separate_live_api_credentials_required/);
});

test("401 and rate-limit failures cannot become a passing result", async () => {
  for (const status of [401, 429]) {
    const fetcher = async () => ({ok:false,status});
    await assert.rejects(livePreflight({key:"a",secret:"b"}, fetcher, async () => {}), new RegExp("live_api_http_" + status));
  }
});

test("invalid broker response is not a connection pass", async () => {
  const fetcher = async () => ({ok:true,json:async()=>({})});
  await assert.rejects(livePreflight({key:"a",secret:"b"}, fetcher, async () => {}), /unexpected_live_broker_response/);
});
