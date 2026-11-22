// Venue-published reports are delayed. Keep their observations separate from fresh quote signals.
import { gunzipSync } from 'node:zlib';
const page = 'https://www.gettex.de/en/trading/delayed-data/posttrade-data/';
const berlinDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
function csvFields(line, delimiter) {
  const fields=[];
  let field='', quoted=false;
  for (let i=0;i<line.length;i++) {
    const c=line[i];
    if (c==='"') {
      if (quoted && line[i+1]==='"') {field+='"'; i++;} else quoted=!quoted;
    } else if (c===delimiter && !quoted) {fields.push(field.trim());field='';}
    else field+=c;
  }
  fields.push(field.trim());
  return fields;
}
export function readTrades(raw, stocks, now, trades) {
  const lines=raw.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const delimiter=lines[0].includes(';')?';':',';
  const header=csvFields(lines[0],delimiter).map(h=>h.toLowerCase().replace(/[^a-z]/g,''));
  const idx=(...names)=>header.findIndex(h=>names.includes(h));
  const isin=idx('isin','instrumentidentificationcode','financialinstrumentidentificationcode');
  const price=idx('price','transactionprice','executionprice');
  const stamp=idx('tradingdatetime','tradingdateandtime','tradedatetime','transactiondatetime','executiondatetime');
  const currency=idx('pricecurrency','currency','transactioncurrency');
  const mic=idx('venueofexecution','executionvenue','mic');
  const flag=idx('flags','tradeflags','flag');
  if ([isin,price,stamp,currency].some(i=>i<0)) throw Error('UNRECOGNISED_FILE_FORMAT');
  const today=berlinDate.format(now);
  for (const line of lines.slice(1)) {
    const f=csvFields(line,delimiter), stock=stocks.get(f[isin]);
    if (!stock || stock.currency!==f[currency] || (mic>=0 && !['MUNC','MUND'].includes(f[mic]))) continue;
    if (flag>=0 && /CANC|AMND/.test(f[flag])) { trades.set(stock.isin,{ambiguous:true}); continue; }
    const iso=f[stamp] || '';
    if (!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d/.test(iso)) continue;
    const at=Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(iso)?iso:iso+'Z');
    const value=Number(f[price]?.replace(',','.'));
    if (!(value>0) || !Number.isFinite(at) || at>now || berlinDate.format(at)!==today) continue;
    let row=trades.get(stock.isin);
    if (!row) { row={first:at,last:at,open:value,latest:value,high:value};trades.set(stock.isin,row); }
    if (row.ambiguous) continue;
    if (at<row.first) {row.first=at;row.open=value;}
    if (at>=row.last) {row.last=at;row.latest=value;}
    row.high=Math.max(row.high,value);
  }
}
export async function gettexResearch(list, now, transport=fetch) {
  const stocks=new Map(list.map(s=>[s.isin,s])), trades=new Map();
  const options={redirect:'error',headers:{'User-Agent':'Mozilla/5.0 AtlasResearch'}};
  const pageResponse=await transport(page,{...options,signal:AbortSignal.timeout(12000)});
  if (!pageResponse.ok) throw Error('GETTEX_FILE_SERVICE_UNAVAILABLE');
  const html=(await pageResponse.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const table=html.match(/<table\b[^>]*>[\s\S]*?<th[^>]*>\s*Filename\s*<\/th>[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw Error('GETTEX_FILE_INDEX_UNAVAILABLE');
  const links=[...new Set([...table.matchAll(/href=["']([^"']+)["']/gi)].map(m=>new URL(m[1].replaceAll('&amp;','&'),page).href))];
  if (!links.length) return {trades,status:'NO_PUBLISHED_TRADE_FILE'};
  for (const link of links) {
    const url=new URL(link);
    if (url.origin!==new URL(page).origin) throw Error('UNVERIFIED_FILE_SOURCE');
    const r=await transport(url,{...options,signal:AbortSignal.timeout(20000)});
    if (!r.ok) throw Error('GETTEX_FILE_DOWNLOAD_FAILED');
    let bytes=Buffer.from(await r.arrayBuffer());
    if (bytes[0]===0x1f && bytes[1]===0x8b) bytes=gunzipSync(bytes,{maxOutputLength:128*1024*1024});
    readTrades(bytes.toString('utf8'),stocks,now,trades);
  }
  return {trades,status:'NO_MATCHING_TRADE'};
}
