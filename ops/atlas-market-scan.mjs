import { gettexResearch } from './atlas-gettex.mjs';
import { marketCatalogue } from './atlas-live-preflight.mjs';

// Use the broker's display symbol and venue together. Internal tickers can lag renames.
const venues = new Map([
  ['NASDAQ', ['', ['NMS','NGM','NCM','NAS']]],
  ['NYSE', ['', ['NYQ','ASE','PCX','BTS','NYS']]],
  ['OTC Markets', ['', ['PNK','OQB','OQX','OEM','OBB']]],
  ['London Stock Exchange', ['.L', ['LSE']]],
  ['London Stock Exchange AIM', ['.L', ['LSE']]],
  ['Deutsche Börse Xetra', ['.DE', ['GER','XETRA']]],
  ['Toronto Stock Exchange', ['.TO', ['TOR']]],
  ['Euronext Paris', ['.PA', ['PAR']]],
  ['Bolsa de Madrid', ['.MC', ['MCE']]],
  ['SIX Swiss Exchange', ['.SW', ['EBS','SWX']]],
  ['Euronext Brussels', ['.BR', ['BRU']]],
  ['Wiener Börse', ['.VI', ['VIE']]],
  ['Euronext Amsterdam', ['.AS', ['AMS']]],
  ['Euronext Lisbon', ['.LS', ['LIS']]]
]);

export function sessionState(events, now) {
  const times = (events || []).map(e => ({ at: Date.parse(e.date), type: e.type }))
    .filter(e => Number.isFinite(e.at)).sort((a,b) => a.at-b.at);
  const past = times.filter(e => e.at <= now).at(-1);
  if (!past || !times.some(e => e.at > now)) return 'UNKNOWN';
  return ['OPEN','BREAK_END'].includes(past.type) ? 'OPEN' : 'CLOSED';
}

export function listStocks({ instruments, exchanges }, now) {
  const schedules = new Map(exchanges.flatMap(exchange => exchange.workingSchedules.map(s => [
    s.id, { venue: exchange.name, session: sessionState(s.timeEvents, now) }
  ])));
  return instruments.filter(i => i.type === 'STOCK').map(i => {
    const { venue, session } = schedules.get(i.workingScheduleId) ?? { venue: 'UNKNOWN', session: 'UNKNOWN' };
    const spec = venues.get(venue);
    const code = i.shortName?.trim().toUpperCase().replace(/[./ ]/g,'-').replace(/-$/,'');
    return { ticker:i.ticker, name:i.name, isin:i.isin, currency:i.currencyCode, venue, session,
      symbol: spec && /^[A-Z0-9-]+$/.test(code || '') ? code+spec[0] : null };
  });
}

export function readQuote(stock, data, now) {
  const m = data?.meta;
  const expectedCurrency = stock.currency === 'GBX' ? 'GBp' : stock.currency;
  if (!m || m.symbol !== stock.symbol || m.currency !== expectedCurrency ||
      m.instrumentType !== 'EQUITY' || !venues.get(stock.venue)?.[1].includes(m.exchangeName)) return { status:'NO_MATCHING_QUOTE' };
  const session = m.currentTradingPeriod?.regular;
  if (!Number.isFinite(session?.start) || !Number.isFinite(session?.end)) return {status:'NO_SESSION'};
  if (now < session.start || now >= session.end) return { status:'CLOSED' };
  const age = now-m.regularMarketTime;
  if (!Number.isFinite(age) || age < 0 || age > 1800 || m.regularMarketTime < session.start) return {status:'DELAYED_OR_STALE'};
  const delayed = age > 600 || m.exchangeDataDelayedBy > 0;
  const first = data.timestamp?.findIndex(t => t >= session.start && t < session.start+300);
  const openingBarClose = data.indicators?.quote?.[0]?.close?.[first];
  const last = m.regularMarketPrice, high = m.regularMarketDayHigh;
  if (![openingBarClose,last,high].every(n => Number.isFinite(n) && n > 0) || last > high || openingBarClose > high) return {status:'INCOMPLETE_QUOTE'};
  // The batch feed supplies the first five-minute close, not the opening auction price.
  const gain = last/openingBarClose-1, pullback = 1-last/high;
  const status = gain >= .05 && pullback <= .01 ? 'STRENGTH' :
    high/openingBarClose >= 1.05 && pullback >= .03 ? 'RALLY_FADING' : 'WATCH';
  return { status: delayed ? 'DELAYED_'+status : status, changeFromOpeningBarPct:+(gain*100).toFixed(2), belowHighPct:+(pullback*100).toFixed(2),
    price:last, sessionEnd:session.end*1000, quoteAt:new Date(m.regularMarketTime*1000).toISOString() };
}

export async function scanMarkets(credentials, log = console.log, transport = fetch, clock = Date.now, observations = []) {
  const stocks = listStocks(await marketCatalogue(credentials, transport),clock());
  if (!stocks.length) throw Error('No stock listings in broker catalogue');
  const coverage = {}, pending = new Map(), signals = [];
  function record(stock, status) {
    const counts = coverage[stock.venue] ??= {};
    counts[status] = (counts[status] ?? 0)+1;
  }
  const gettex = stocks.filter(s => s.venue === 'Gettex');
  if (gettex.length) {
    let feed;
    try { feed = await gettexResearch(gettex,clock(),transport); }
    catch (error) { feed = { trades:new Map(), status:'GETTEX_FEED_UNAVAILABLE' };
      log(JSON.stringify({event:'atlas_gettex_feed_issue',reason:error.message})); }
    for (const stock of gettex) {
      const t=feed.trades.get(stock.isin);
      if (!t || t.ambiguous) { record(stock,t?'AMBIGUOUS_TRADE':feed.status); continue; }
      if (stock.session==='CLOSED' || clock()-t.last>30*60000 || t.first===t.last) {
        record(stock,'HISTORICAL_TRADES'); continue;
      }
      const gain=t.latest/t.open-1, pullback=1-t.latest/t.high;
      const status=gain>=.05 && pullback<=.01 ? 'DELAYED_STRENGTH' :
        t.high/t.open>=1.05 && pullback>=.03 ? 'DELAYED_RALLY_FADING' : 'DELAYED_WATCH';
      record(stock,status);
      if (status!=='DELAYED_WATCH') signals.push({ticker:stock.ticker,venue:stock.venue,status,
        quoteAt:new Date(t.last).toISOString(),changeFromFirstReportedTradePct:+(gain*100).toFixed(2)});
    }
  }
  for (const s of stocks) {
    if (s.venue==='Gettex') continue;
    if (!s.symbol) { record(s,'NO_VENUE_PRICE_MAPPING'); continue; }
    if (s.session === 'CLOSED') { record(s,'CLOSED'); continue; }
    if (!pending.has(s.symbol)) pending.set(s.symbol,[]);
    pending.get(s.symbol).push(s);
  }
  const symbols = [...pending.keys()];
  // Rotate the starting point so a provider interruption does not always exclude the same listings.
  const start = symbols.length ? Math.floor(clock()/900000)*257 % symbols.length : 0;
  const queue = symbols.slice(start).concat(symbols.slice(0,start));
  const deadline = clock()+11*60000;
  let next = 0, throttled = false;
  async function worker() {
    while (next < queue.length && !throttled && clock() < deadline) {
      const batch = queue.slice(next,next+20);
      next += batch.length;
      let quotes, error;
      try {
        const url = new URL('https://query1.finance.yahoo.com/v7/finance/spark');
        url.search = new URLSearchParams({symbols:batch.join(','),range:'1d',interval:'5m'});
        const r = await transport(url,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{'User-Agent':'Mozilla/5.0 AtlasResearch'}});
        if (r.status === 429) throttled = true;
        if (!r.ok) throw Error('QUOTE_HTTP_'+r.status);
        const body = await r.json();
        if (!Array.isArray(body.spark?.result)) throw Error('QUOTE_DATA_UNAVAILABLE');
        quotes = new Map(body.spark.result.map(q => [q.symbol,q.response?.[0]]));
      } catch(e) { error = /^QUOTE_HTTP_\d+$/.test(e.message) ? e.message : 'QUOTE_DATA_UNAVAILABLE'; }
      for (const symbol of batch) for (const stock of pending.get(symbol)) {
        const result = error ? {status:error} : readQuote(stock,quotes.get(symbol),clock()/1000);
        record(stock,result.status);
        if (stock.session === 'OPEN' && ['STRENGTH','WATCH','RALLY_FADING'].includes(result.status))
          observations.push({...stock,...result});
        if (['STRENGTH','RALLY_FADING','DELAYED_STRENGTH','DELAYED_RALLY_FADING'].includes(result.status)) signals.push({ticker:stock.ticker,venue:stock.venue,...result});
      }
      await new Promise(resolve => setTimeout(resolve,250));
    }
  }
  await Promise.all([worker(),worker(),worker()]);
  for (const symbol of queue.slice(next)) for (const stock of pending.get(symbol)) record(stock,'DEFERRED');
  for (const s of signals) log(JSON.stringify({event:'atlas_market_signal',...s}));
  const report = {event:'atlas_market_coverage',stocks:stocks.length,venues:Object.keys(coverage).length,
    signals:signals.length,coverage};
  log(JSON.stringify(report));
  return report;
}
