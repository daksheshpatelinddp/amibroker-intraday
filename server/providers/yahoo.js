// Intraday bars from Yahoo Finance's public chart endpoint (free, no account, unofficial).
// Limits Yahoo applies: 1m = last 7 days, 5m/15m/30m = last 60 days, 60m = last 2 years. NSE data is about 15 minutes late.
// Every provider exports { name, intervals, getBars({symbol, interval, range}) } and returns [{ t (epoch seconds), o, h, l, c, v }].

export const name = 'yahoo';
export const intervals = ['1m', '5m', '15m', '30m', '60m'];
const DEFAULT_RANGE = { '1m': '7d', '5m': '60d', '15m': '60d', '30m': '60d', '60m': '730d' };
const INDEX = { NIFTY: '^NSEI', NIFTY50: '^NSEI', BANKNIFTY: '^NSEBANK', NIFTYBANK: '^NSEBANK', SENSEX: '^BSESN', INDIAVIX: '^INDIAVIX', FINNIFTY: 'NIFTY_FIN_SERVICE.NS', MIDCPNIFTY: '^NSEMDCP50' };

/** App symbol -> Yahoo symbol. RELIANCE -> RELIANCE.NS, NIFTY -> ^NSEI, M&M -> M&M.NS. Anything with a dot or caret is used as given. */
export function yahooSymbol(sym) {
  let s = String(sym || '').trim().toUpperCase();
  if (!s) throw new Error('symbol missing');
  if (/^[\^~]/.test(s) || /\.(NS|BO)$/.test(s)) return s;
  s = s.replace(/\s+/g, '');
  return INDEX[s] || `${s}.NS`;
}

export async function getBars({ symbol, interval, range, fetchImpl = fetch }) {
  if (!intervals.includes(interval)) throw new Error(`interval ${interval} not supported (use ${intervals.join(', ')})`);
  const ys = yahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?interval=${interval}&range=${range || DEFAULT_RANGE[interval]}&includePrePost=false`;
  const r = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; amibroker-web)', Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Yahoo answered ${r.status} for ${ys}`);
  return parseChart(await r.json());
}

export function parseChart(j) {
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error((j && j.chart && j.chart.error && j.chart.error.description) || 'no data for this symbol');
  const ts = res.timestamp || [], q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i];
    if (![o, h, l, c].every((x) => typeof x === 'number' && x > 0)) continue;   // Yahoo leaves null holes
    out.push({ t: ts[i], o, h, l, c, v: (q.volume && q.volume[i]) || 0 });
  }
  return out;
}
