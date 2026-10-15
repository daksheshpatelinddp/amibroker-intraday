// Small server for intraday bars. Start: node server/server.js   (PORT, PROVIDER, ALLOW_ORIGIN, CACHE_SECONDS are optional)
//   GET /api/intraday?symbol=RELIANCE&interval=5m[&range=5d]  ->  { symbol, interval, provider, bars: [{t,o,h,l,c,v}] }  (t = epoch seconds, UTC)
//   GET /api/health
// To use another data source (Kite Connect, a broker API ...) add server/providers/<name>.js with the same 3 exports and start with PROVIDER=<name>.
import http from 'node:http';

const PORT = Number(process.env.PORT) || 8787;
const ORIGIN = process.env.ALLOW_ORIGIN || '*';
const TTL = (Number(process.env.CACHE_SECONDS) || 60) * 1000;
const provider = await import(`./providers/${process.env.PROVIDER || 'yahoo'}.js`);
const cache = new Map();

export async function handle(url) {
  if (url.pathname === '/api/health') return [200, { ok: true, provider: provider.name, intervals: provider.intervals }];
  if (url.pathname !== '/api/intraday') return [404, { error: 'not found' }];
  const symbol = (url.searchParams.get('symbol') || '').trim(), interval = url.searchParams.get('interval') || '5m', range = url.searchParams.get('range') || '';
  if (!/^[\w&.^~\- ]{1,30}$/.test(symbol)) return [400, { error: 'bad symbol' }];
  if (range && !/^\d{1,4}(d|mo|y)$/.test(range)) return [400, { error: 'bad range' }];
  const key = `${symbol}|${interval}|${range}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return [200, hit.body];
  try {
    const bars = await provider.getBars({ symbol, interval, range });
    const body = { symbol, interval, provider: provider.name, bars };
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return [200, body];
  } catch (e) { return [502, { error: String(e.message || e) }]; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  http.createServer(async (req, res) => {
    const h = { 'Access-Control-Allow-Origin': ORIGIN, 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...h, 'Access-Control-Allow-Methods': 'GET' }); return res.end(); }
    const [code, body] = await handle(new URL(req.url, 'http://x'));
    res.writeHead(code, h); res.end(JSON.stringify(body));
  }).listen(PORT, () => console.log(`intraday server on :${PORT} (${provider.name})`));
}
