import test from 'node:test';
import assert from 'node:assert/strict';
import {listStocks,sessionState,readQuote,scanMarkets} from './atlas-market-scan.mjs';
const stock = {ticker:'VODl_EQ',shortName:'VOD',type:'STOCK',currencyCode:'GBX',workingScheduleId:7};
const exchange={name:'London Stock Exchange',workingSchedules:[{id:7,timeEvents:[]}]};
const catalogue={instruments:[stock,{...stock,type:'ETF'}],exchanges:[exchange]};
test('includes unheld international stocks and excludes funds',()=>{
  const [v]=listStocks(catalogue,0);
  assert.equal(v.symbol,'VOD.L');
  assert.equal(listStocks(catalogue,0).length,1);
  const m={symbol:'VOD.L',exchangeName:'LSE',currency:'GBp',instrumentType:'EQUITY',regularMarketPrice:106,
    regularMarketTime:1600,regularMarketDayHigh:107,currentTradingPeriod:{regular:{start:1000,end:3000}}};
  const q={meta:m,timestamp:[1000],indicators:{quote:[{close:[100]}]}};
  assert.equal(readQuote(v,q,1601).status,'STRENGTH');
  m.regularMarketPrice=103;
  assert.equal(readQuote(v,q,1601).status,'RALLY_FADING');
  assert.equal(readQuote(v,q,2900).status,'DELAYED_RALLY_FADING');
  m.exchangeName='NMS';
  assert.equal(readQuote(v,q,1601).status,'NO_MATCHING_QUOTE');
});
test('honours the regular session and breaks',()=>{
  const events=['OPEN','BREAK_START','BREAK_END','CLOSE'].map((type,i)=>({date:new Date(1000+i*1000).toISOString(),type}));
  assert.equal(sessionState(events,2500),'CLOSED');
  assert.equal(sessionState(events,3500),'OPEN');
  assert.equal(sessionState(events,100),'UNKNOWN');
});
test('a partial feed accounts for every broker stock',async()=>{
  const fetcher=async url=>{
    if(String(url).endsWith('/instruments'))return Response.json([stock,{...stock,workingScheduleId:400}]);
    if(String(url).endsWith('/exchanges'))return Response.json([exchange]);
    return new Response(null,{status:429});
  };
  const r=await scanMarkets({key:'fixture',secret:'fixture'},()=>{},fetcher);
  assert.equal(r.stocks,2);
  assert.equal(r.coverage['London Stock Exchange'].QUOTE_HTTP_429,1);
  assert.equal(r.coverage.UNKNOWN.NO_VENUE_PRICE_MAPPING,1);
});

import { readTrades, gettexResearch } from './atlas-gettex.mjs';
test('gettex uses same-ISIN same-currency venue trades and reports an empty source explicitly',async()=>{
  const item={isin:'DE0000000000',currency:'EUR'};
  const stocks=new Map([[item.isin,item]]), trades=new Map();
  const csv='ISIN;Trading date and time;Price;Price currency;Venue of execution\n'+
    'DE0000000000;2026-11-20T09:00:00Z;10;EUR;MUND\n'+
    'DE0000000000;2026-11-20T10:00:00Z;11;EUR;MUND\n'+
    'DE0000000000;2026-11-20T10:05:00Z;19;USD;MUND';
  readTrades(csv,stocks,Date.parse('2026-11-20T10:15:00Z'),trades);
  assert.equal(trades.get(item.isin).high,11);
  assert.equal(trades.get(item.isin).open,10);
  const empty=await gettexResearch([item],Date.now(),async()=>new Response('<table><th>Filename</th><tbody></tbody></table>'));
  assert.equal(empty.status,'NO_PUBLISHED_TRADE_FILE');
});
