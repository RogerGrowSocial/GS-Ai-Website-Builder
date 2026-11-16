// CJdropshipping V2 adapter. Server-side only; NEVER export CJ tokens to the browser.
const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const SAFE_ID = /^[a-zA-Z0-9_-]{3,120}$/;
const fail = (code, message) => Object.assign(new Error(message), {code});
const requiredId = value => {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw fail(400, 'Ongeldige CJ-product- of variant-ID');
  return value;
};
const publicHttps = value => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password ||
        /^(localhost|127\\.|10\\.|192\\.168\\.|169\\.254\\.|0\\.)/.test(url.hostname) || value.length > 400)
      throw Error('invalid');
    return url.href;
  } catch { throw fail(400, 'Gebruik een publiek bereikbare HTTPS-productafbeelding of productlink'); }
};

export function normalizeCJList(data) {
  const buckets = Array.isArray(data?.content) ? data.content : [];
  const items = buckets.flatMap(bucket => Array.isArray(bucket?.productList) ? bucket.productList : []);
  return {
    total: Number.isInteger(data?.totalRecords) ? data.totalRecords : 0,
    page: Number.isInteger(data?.pageNumber) ? data.pageNumber : 1,
    items: items.map(p => ({
      pid: String(p.id || p.pid || ''), sku: String(p.sku || p.spu || ''),
      title: String(p.nameEn || p.productNameEn || '').slice(0,250),
      image: typeof p.bigImage === 'string' && /^https:\/\//.test(p.bigImage) ? p.bigImage : null,
      price_usd: p.nowPrice ?? p.sellPrice ?? null,
      verified_warehouse_stock: Number(p.totalVerifiedInventory || 0),
      listings: Number(p.listedNum || 0),
      ce_claimed: p.hasCECertification === 1,
      country: String(p.countryCode || ''),
      product_type: String(p.productType || '')
    })).filter(p => p.pid)
  };
}

export class CJClient {
  constructor({apiKey = process.env.CJ_API_KEY || '', fetcher = fetch, clock = () => Date.now()} = {}) {
    this.apiKey = String(apiKey).trim(); this.fetcher = fetcher; this.clock = clock;
    this.token = ''; this.expiry = 0; this.pendingAuth = null;
    this.lastCall = 0; this.callQueue = Promise.resolve();
  }
  get configured() { return this.apiKey.length > 10; }
  async http(path, {method = 'GET', data, token} = {}) {
    if (!this.configured) throw fail(503, 'CJ_API_KEY ontbreekt op de KAP-server');
    // Absolute URLs and arbitrary endpoints are forbidden (protect server credentials).
    if (!/^\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&%+.~-]*)?$/.test(path)) throw fail(400, 'Ongeldige CJ API-route');
    // CJ limits API calls to roughly one request per second; serialize token, product and freight calls.
    const run = this.callQueue.then(async () => {
      const gap = Math.max(0, this.lastCall + 1100 - this.clock());
      if (gap) await new Promise(resolve => setTimeout(resolve, gap));
      this.lastCall = this.clock();
      return this.fetcher(BASE + path, {
        method, headers: {'Content-Type': 'application/json', ...(token ? {'CJ-Access-Token':token} : {})},
        ...(data === undefined ? {} : {body:JSON.stringify(data)}),
        signal: AbortSignal.timeout(15000)
      });
    });
    this.callQueue = run.then(() => {}, () => {});
    let response;
    try { response = await run; }
    catch { throw fail(502, 'CJ is tijdelijk niet bereikbaar'); }
    if (!response.ok) throw fail(502, 'CJ API gaf HTTP ' + response.status);
    let parsed;
    try { parsed = await response.json(); }
    catch { throw fail(502, 'CJ gaf geen geldige JSON terug'); }
    if (parsed?.result === false || parsed?.success === false ||
        (typeof parsed?.code === 'number' && ![0,200].includes(parsed.code)))
      throw fail(502, 'CJ wees de aanvraag af (code ' + String(parsed?.code ?? 'unknown').slice(0,20) + ')');
    return parsed?.data;
  }
  async accessToken() {
    if (this.token && this.clock() < this.expiry) return this.token;
    if (this.pendingAuth) return this.pendingAuth;
    this.pendingAuth = (async () => {
      const data = await this.http('/authentication/getAccessToken', {method:'POST',data:{apiKey:this.apiKey}});
      if (!data?.accessToken) throw fail(502, 'CJ gaf geen toegangstoken terug');
      this.token = data.accessToken;
      const apiExpiry = Date.parse(data.accessTokenExpiryDate);
      this.expiry = Number.isFinite(apiExpiry) ? Math.max(this.clock()+60000,apiExpiry-300000) : this.clock()+60*60*1000;
      return this.token;
    })();
    try { return await this.pendingAuth; } finally { this.pendingAuth = null; }
  }
  async request(path,options = {}) { return this.http(path,{...options,token:await this.accessToken()}); }
  async search(keyword,{page = 1} = {}) {
    if (typeof keyword !== 'string' || keyword.trim().length < 3 || keyword.length > 110) throw fail(400, 'Gebruik minimaal drie zoektekens');
    if (!Number.isSafeInteger(page)||page<1||page>100) throw fail(400,'Ongeldige pagina');
    const query = new URLSearchParams({keyWord:keyword.trim(),page:String(page),size:'25'});
    const data = await this.request('/product/listV2?' + query.toString());
    return normalizeCJList(data);
  }
  product(pid) { return this.request('/product/query?pid=' + encodeURIComponent(requiredId(pid))); }
  variants(pid) { return this.request('/product/variant/query?pid=' + encodeURIComponent(requiredId(pid))); }
  stock(vid) { return this.request('/product/stock/queryByVid?vid=' + encodeURIComponent(requiredId(vid))); }
  freight({vid,origin = 'CN',zip = ''}) {
    requiredId(vid);
    if (!/^[A-Z]{2}$/.test(origin)) throw fail(400,'Ongeldige magazijnlocatie');
    if (typeof zip !== 'string'||zip.length>16) throw fail(400,'Ongeldige postcode');
    return this.request('/logistic/freightCalculate',{method:'POST',data:{
      startCountryCode:origin,endCountryCode:'NL',zip,products:[{quantity:1,vid}]
    }});
  }
  async createSourcing({productName,productImage,productUrl = '',remark = ''}) {
    if (typeof productName !== 'string'||productName.length<8||productName.length>180) throw fail(400,'Productnaam vereist');
    if (typeof remark !== 'string'||remark.length>180) throw fail(400,'Omschrijving te lang');
    const input={productName,productImage:publicHttps(productImage),remark,productUrl:productUrl?publicHttps(productUrl):'',price:''};
    const result=await this.request('/product/sourcing/create',{method:'POST',data:input});
    if (!result?.cjSourcingId) throw fail(502,'CJ bevestigde de sourcingaanvraag niet');
    return {sourceId:String(result.cjSourcingId)};
  }
  sourcingStatus(sourceId) {
    requiredId(sourceId);
    return this.request('/product/sourcing/query',{method:'POST',data:{sourceIds:[sourceId]}});
  }
}
export const cj = new CJClient();
