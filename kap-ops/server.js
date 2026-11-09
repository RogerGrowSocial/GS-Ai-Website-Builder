import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const dbUrl = process.env.DATABASE_URL;
let pool = dbUrl ? new pg.Pool({ connectionString: dbUrl, ssl: /localhost|127\.0\.0\.1/.test(dbUrl) ? false : { rejectUnauthorized: false }, max: 8 }) : null;
const demoMode = process.env.KAP_DEMO_MODE === 'true';
if(demoMode){
  const { PGlite } = await import('@electric-sql/pglite');
  const demoDb = new PGlite();
  const demoQuery=(sql,params=[])=>!params.length&&sql.includes('CREATE TABLE')?demoDb.exec(sql):demoDb.query(sql,params);
  pool={query:demoQuery,connect:async()=>({query:demoQuery,release(){}})};
}
const RATE = new Map();
const ROLES = ['owner', 'manager', 'support', 'fulfillment'];
const ORDER_STATUS = ['draft','pending','processing','shipped','delivered','cancelled'];
const TICKET_STATUS = ['open','pending','resolved','closed'];
const RETURN_STATUS = ['requested','approved','received','rejected','closed'];
const PRODUCT_CATALOG = [
  ['essential-zwart-60','Essential Zwart 60',47500],
  ['essential-rvs-60','Essential RVS 60',48500],
  ['studio-zwart-60','Studio Zwart 60',49500]
];

const uid = () => crypto.randomUUID();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const secret = () => crypto.randomBytes(32).toString('base64url');
const passhash = password => { const salt = crypto.randomBytes(16).toString('hex'); return salt+':'+crypto.scryptSync(password,salt,64).toString('hex'); };
const passcheck = (password, stored) => {
  const [salt, value] = String(stored).split(':');
  if (!salt || !value || !/^[a-f0-9]{128}$/.test(value)) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(value,'hex'));
};
const bad = (code, message) => Object.assign(new Error(message), { code });
const validEmail = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length < 254;
const clean = (value, limit = 500) => String(value ?? '').trim().slice(0,limit);
const positive = (value, max = 1000) => Number.isInteger(value) && value > 0 && value <= max;
const json = (res, code, data, headers={}) => {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(JSON.stringify(data));
};
const query = (sql, params=[]) => { if (!pool) throw bad(503,'Database nog niet gekoppeld'); return pool.query(sql,params); };
const one = async (sql, params=[]) => (await query(sql,params)).rows[0] || null;
const audit = async (actor, type, entity, action, details={}) => query('INSERT INTO kap_events(id,actor_id,entity_type,entity_id,action,details) VALUES($1,$2,$3,$4,$5,$6)',[uid(),actor||null,type,entity||null,action,JSON.stringify(details)]);
function body(req, limit=100000) { return new Promise((resolve,reject) => {
  const chunks=[]; let size=0;
  req.on('data',c=>{size+=c.length;if(size>limit){reject(bad(413,'Verzoek te groot'));req.destroy();}else chunks.push(c)});
  req.on('end',()=>{try{const raw=Buffer.concat(chunks);resolve({raw,data:raw.length?JSON.parse(raw.toString('utf8')):{}})}catch{reject(bad(400,'Ongeldige JSON'))}});
  req.on('error',reject);
});}
function originCheck(req) {
  const origin=req.headers.origin;
  const allowed=process.env.KAP_ALLOWED_ORIGIN;
  if (origin && allowed && origin!==allowed) throw bad(403,'Ongeldige herkomst');
  if (origin && !allowed && !/^https?:\/\/localhost(?::\d+)?$/.test(origin)) throw bad(403,'Origin niet geconfigureerd');
}
function limitLogin(req) {
  const ip=req.socket.remoteAddress||'unknown';const now=Date.now();const prev=RATE.get(ip)||[];
  const recent=prev.filter(t=>t>now-15*60*1000);
  if(recent.length>=8) throw bad(429,'Te veel pogingen. Probeer later opnieuw.');
  recent.push(now);RATE.set(ip,recent);
  if(RATE.size>5000) for(const [key,arr] of RATE) if(arr.every(t=>t<now-15*60*1000))RATE.delete(key);
  return ip;
}
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1))]}));
async function session(req) {
  const token=cookies(req).kap_session;if(!token)return null;
  return one(`SELECT u.id,u.email,u.name,u.role,s.csrf_hash FROM kap_sessions s JOIN kap_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,[sha(token)]);
}
const requireRole=(user, roles=ROLES)=>{if(!user||!roles.includes(user.role))throw bad(403,'Geen toegang')};
function verifyCsrf(req,user) { originCheck(req);const token=req.headers['x-kap-csrf'];if(!token||sha(String(token))!==user.csrf_hash)throw bad(403,'Sessiecontrole mislukt'); }
function safeUser(u){return {id:u.id,email:u.email,name:u.name,role:u.role}}
async function migrate(){
  if(!pool)return;
  await query(fs.readFileSync(path.join(ROOT,'schema.sql'),'utf8'));
  for(const [sku,title,price] of PRODUCT_CATALOG)await query('INSERT INTO kap_products(sku,title,price_cents) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[sku,title,price]);
  const count=await one('SELECT count(*)::int AS count FROM kap_users');
  if(count.count===0){
    const email=process.env.KAP_ADMIN_EMAIL;const password=process.env.KAP_ADMIN_PASSWORD;
    if(validEmail(email)&&password?.length>=14){await query('INSERT INTO kap_users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',[uid(),email.toLowerCase(),'KAP. Eigenaar',passhash(password),'owner']);console.log('KAP. initial owner configured');}
    else console.warn('KAP. setup pending: configure independent admin email and strong password (14+ chars).');
  }
  if(demoMode)await seedDemo();
}
async function seedDemo(){
  const existing=await one('SELECT count(*)::int AS count FROM kap_orders');if(existing.count>0)return;
  const first=await createOrder({customer:{email:'emma@voorbeeld.invalid',first_name:'Emma',last_name:'Demo'},items:[{sku:'essential-zwart-60',quantity:1}]},null,'manual');
  await query("UPDATE kap_orders SET status='delivered',payment_status='paid',fulfillment_status='fulfilled' WHERE id=$1",[first.id]);
  const second=await createOrder({customer:{email:'daan@voorbeeld.invalid',first_name:'Daan',last_name:'Voorbeeld'},items:[{sku:'studio-zwart-60',quantity:1}]},null,'manual');
  await query("UPDATE kap_orders SET status='pending' WHERE id=$1",[second.id]);
  const emma=await one('SELECT id FROM kap_customers WHERE email=$1',['emma@voorbeeld.invalid']);
  const daan=await one('SELECT id FROM kap_customers WHERE email=$1',['daan@voorbeeld.invalid']);
  const ticketId=uid();
  await query("INSERT INTO kap_tickets(id,customer_id,order_id,subject,priority) VALUES($1,$2,$3,$4,$5)",[ticketId,daan.id,second.id,'Vraag over montage van 60 cm','high']);
  await query("INSERT INTO kap_messages(id,ticket_id,direction,body,sender) VALUES($1,$2,$3,$4,$5)",[uid(),ticketId,'inbound','Past deze afzuigkap onder mijn bestaande bovenkast?','daan@voorbeeld.invalid']);
  await query("INSERT INTO kap_tickets(id,customer_id,order_id,subject,status) VALUES($1,$2,$3,$4,$5)",[uid(),emma.id,first.id,'Vraag over retourtermijn','pending']);
  await query("INSERT INTO kap_returns(id,order_id,reason) VALUES($1,$2,$3)",[uid(),first.id,'Voorbeeldretour voor demonstratie']);
  console.log('KAP. disposable demo data created');
}
async function ensureCustomer(client, input) {
  const email=clean(input.email,254).toLowerCase();if(!validEmail(email))throw bad(400,'Geldig klant-e-mailadres vereist');
  const first=clean(input.first_name,100),last=clean(input.last_name,100),phone=clean(input.phone,50);
  const r=await client.query(`INSERT INTO kap_customers(id,email,first_name,last_name,phone) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(email) DO UPDATE SET first_name=CASE WHEN EXCLUDED.first_name<>'' THEN EXCLUDED.first_name ELSE kap_customers.first_name END,
    last_name=CASE WHEN EXCLUDED.last_name<>'' THEN EXCLUDED.last_name ELSE kap_customers.last_name END,
    phone=CASE WHEN EXCLUDED.phone<>'' THEN EXCLUDED.phone ELSE kap_customers.phone END,updated_at=now() RETURNING *`,[uid(),email,first,last,phone]);
  return r.rows[0];
}
async function createOrder(input,actor,source='manual',external=null) {
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>30)throw bad(400,'Voeg minimaal één artikel toe');
  const client=await pool.connect();try{
    await client.query('BEGIN');
    const customer=await ensureCustomer(client,input.customer||{});let subtotal=0;const items=[];
    for(const item of input.items){
      const sku=clean(item.sku,120),qty=Number(item.quantity);
      if(!positive(qty,100))throw bad(400,'Ongeldige hoeveelheid');
      const pr=(await client.query('SELECT * FROM kap_products WHERE sku=$1 FOR UPDATE',[sku])).rows[0];
      if(!pr||pr.status==='archived'||(source!=='manual'&&pr.status!=='ready'))throw bad(400,'Product niet verkoopklaar: '+sku);
      if(source!=='manual'&&pr.stock_quantity<qty)throw bad(409,'Onvoldoende voorraad: '+sku);
      subtotal+=pr.price_cents*qty;if(subtotal>100000000)throw bad(400,'Orderbedrag te hoog');
      items.push({sku,title:pr.title,quantity:qty,price:pr.price_cents});
    }
    const id=uid(),shipping=source==='manual'?Math.max(0,Math.min(100000,Number(input.shipping_cents)||0)):0;
    const result=(await client.query(`INSERT INTO kap_orders(id,customer_id,status,subtotal_cents,shipping_cents,total_cents,source,external_reference,shipping_address)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[id,customer.id,source==='manual'?'draft':'pending',subtotal,shipping,subtotal+shipping,source,external,JSON.stringify(input.shipping_address||{})])).rows[0];
    for(const item of items)await client.query('INSERT INTO kap_order_items(id,order_id,sku,title,quantity,unit_price_cents,line_total_cents) VALUES($1,$2,$3,$4,$5,$6,$7)',[uid(),id,item.sku,item.title,item.quantity,item.price,item.price*item.quantity]);
    if(source!=='manual')for(const item of items)await client.query('UPDATE kap_products SET stock_quantity=stock_quantity-$1 WHERE sku=$2',[item.quantity,item.sku]);
    await client.query('INSERT INTO kap_events(id,actor_id,entity_type,entity_id,action,details) VALUES($1,$2,$3,$4,$5,$6)',[uid(),actor||null,'order',id,'created',JSON.stringify({source,total_cents:subtotal+shipping})]);
    await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
function webhookVerified(req,raw,envKey){
  const key=process.env[envKey];if(!key)throw bad(503,'Integratie niet geconfigureerd');
  const timestamp=Number(req.headers['x-kap-timestamp']);const signature=String(req.headers['x-kap-signature']||'').replace(/^sha256=/,'');
  if(!Number.isSafeInteger(timestamp)||Math.abs(Date.now()-timestamp)>5*60*1000)throw bad(401,'Ongeldige tijdstempel');
  const expected=crypto.createHmac('sha256',key).update(String(timestamp)+'.').update(raw).digest('hex');
  if(!/^[a-f0-9]{64}$/.test(signature)||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw bad(401,'Ongeldige handtekening');
}
function staticFile(req,res,pathname){
  const requested=pathname==='/admin'||pathname==='/admin/'?'index.html':pathname.slice('/admin/'.length);
  const file=path.resolve(ROOT,'public',requested);
  if(!file.startsWith(path.resolve(ROOT,'public')+path.sep)&&file!==path.resolve(ROOT,'public','index.html'))throw bad(404,'Niet gevonden');
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw bad(404,'Niet gevonden');
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://d8j0ntlcm91z4.cloudfront.net; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
  fs.createReadStream(file).pipe(res);
}
async function handler(req,res){
  const url=new URL(req.url,'http://localhost');const p=url.pathname;const method=req.method;
  if(method==='GET'&&p==='/health') {try{await query('SELECT 1');return json(res,200,{status:'ok',service:'kap-operations'})}catch{return json(res,503,{status:'not_ready'})}}
  if(method==='GET'&&p==='/'){res.writeHead(302,{Location:'/admin/'});return res.end()}
  if(method==='GET'&&(p==='/admin'||p.startsWith('/admin/')))return staticFile(req,res,p);
  if(!p.startsWith('/api/'))throw bad(404,'Niet gevonden');
  if(demoMode&&p.startsWith('/api/webhooks/'))throw bad(503,'Integraties zijn uitgeschakeld in de tijdelijke demo');
  if(method!=='GET'&&!['POST','PATCH','DELETE'].includes(method))throw bad(405,'Methode niet toegestaan');
  if(method!=='GET'&&!String(req.headers['content-type']||'').startsWith('application/json'))throw bad(415,'JSON vereist');
  if(p==='/api/login'&&method==='POST'){
    originCheck(req);const ip=limitLogin(req);const {data}=await body(req);const email=clean(data.email,254).toLowerCase();
    const user=await one('SELECT * FROM kap_users WHERE email=$1 AND active=true',[email]);
    if(!user||!passcheck(String(data.password||''),user.password_hash))throw bad(401,'E-mailadres of wachtwoord onjuist');
    RATE.delete(ip);const token=secret(),csrf=secret();
    await query('INSERT INTO kap_sessions(token_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval \'7 days\')',[sha(token),user.id,sha(csrf)]);
    res.setHeader('Set-Cookie',`kap_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`);
    return json(res,200,{user:safeUser(user),csrf});
  }
  if(p==='/api/webhooks/checkout'&&method==='POST'){
    const {raw,data}=await body(req);webhookVerified(req,raw,'KAP_ORDER_WEBHOOK_SECRET');
    const reference=clean(data.external_reference,200);if(!reference)throw bad(400,'Referentie ontbreekt');
    const exists=await one('SELECT id,number FROM kap_orders WHERE external_reference=$1',[reference]);
    if(exists)return json(res,200,{id:exists.id,number:exists.number,duplicate:true});
    const order=await createOrder(data,null,'webhook',reference);return json(res,201,{id:order.id,number:order.number});
  }
  if(p==='/api/webhooks/payment'&&method==='POST'){
    const {raw,data}=await body(req);webhookVerified(req,raw,'KAP_PAYMENT_WEBHOOK_SECRET');
    const receipt=clean(data.event_id,250),reference=clean(data.external_reference,200);
    if(!receipt||!reference||!['paid','refunded'].includes(data.status))throw bad(400,'Ongeldig betalingsevenement');
    const client=await pool.connect();try{
      await client.query('BEGIN');
      if((await client.query('SELECT id FROM kap_webhook_receipts WHERE id=$1',['payment:'+receipt])).rowCount){await client.query('ROLLBACK');return json(res,200,{duplicate:true})}
      const order=(await client.query('SELECT * FROM kap_orders WHERE external_reference=$1 FOR UPDATE',[reference])).rows[0];
      if(!order)throw bad(404,'Order niet gevonden');
      if(data.currency!==order.currency||Number(data.amount_cents)!==order.total_cents)throw bad(409,'Betaling en orderbedrag komen niet overeen');
      if(data.status==='paid'&&order.payment_status==='refunded')throw bad(409,'Terugbetaalde order kan niet opnieuw worden betaald');
      await client.query('UPDATE kap_orders SET payment_status=$1,updated_at=now() WHERE id=$2',[data.status,order.id]);
      await client.query('INSERT INTO kap_webhook_receipts(id) VALUES($1)',['payment:'+receipt]);
      await client.query('INSERT INTO kap_events(id,entity_type,entity_id,action,details) VALUES($1,$2,$3,$4,$5)',[uid(),'order',order.id,'payment_webhook',JSON.stringify({status:data.status,event_id:receipt})]);
      await client.query('COMMIT');return json(res,200,{ok:true,order_id:order.id});
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }
  if(p==='/api/webhooks/inbound-email'&&method==='POST'){
    const {raw,data}=await body(req);webhookVerified(req,raw,'KAP_INBOUND_SECRET');
    const messageId=clean(data.message_id,250);if(!messageId||!validEmail(data.from)||!clean(data.body,20000))throw bad(400,'Onvolledig bericht');
    if(await one('SELECT id FROM kap_webhook_receipts WHERE id=$1',[messageId]))return json(res,200,{duplicate:true});
    const client=await pool.connect();try{await client.query('BEGIN');const c=await ensureCustomer(client,{email:data.from});
      let ticket=null;if(data.ticket_id)ticket=(await client.query('SELECT * FROM kap_tickets WHERE id=$1 AND customer_id=$2',[data.ticket_id,c.id])).rows[0];
      if(!ticket)ticket=(await client.query('INSERT INTO kap_tickets(id,customer_id,subject) VALUES($1,$2,$3) RETURNING *',[uid(),c.id,clean(data.subject,250)||'Nieuwe klantvraag'])).rows[0];
      await client.query('INSERT INTO kap_messages(id,ticket_id,direction,body,sender,external_id) VALUES($1,$2,$3,$4,$5,$6)',[uid(),ticket.id,'inbound',clean(data.body,20000),data.from,messageId]);
      await client.query('UPDATE kap_tickets SET status=$1,updated_at=now() WHERE id=$2',['open',ticket.id]);
      await client.query('INSERT INTO kap_webhook_receipts(id) VALUES($1)',[messageId]);await client.query('COMMIT');return json(res,201,{ticket_id:ticket.id});
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }
  const user=await session(req);if(!user)throw bad(401,'Log opnieuw in');
  if(p==='/api/session'&&method==='GET'){
    // CSRF is rotated only on login and is stored hashed. Frontend gets it from a session-bound response.
    // A separate one-use CSRF claim allows a refreshed tab to recover without revealing it to a cross-origin reader.
    const csrf=secret();await query('UPDATE kap_sessions SET csrf_hash=$1 WHERE token_hash=$2',[sha(csrf),sha(cookies(req).kap_session)]);
    return json(res,200,{user:safeUser(user),csrf,features:{mail:!demoMode&&!!(process.env.KAP_MAIL_API_KEY&&process.env.KAP_FROM_EMAIL),inbound:!demoMode&&!!process.env.KAP_INBOUND_SECRET,checkout:false,demo:demoMode}});
  }
  if(method!=='GET')verifyCsrf(req,user);
  if(p==='/api/logout'&&method==='POST'){await query('DELETE FROM kap_sessions WHERE token_hash=$1',[sha(cookies(req).kap_session)]);res.setHeader('Set-Cookie','kap_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true})}
  if(p==='/api/dashboard'&&method==='GET'){
    const [a,b,c,d,e]=await Promise.all([
      one(`SELECT count(*)::int AS total,count(*) FILTER(WHERE status IN ('pending','processing'))::int AS active,coalesce(sum(total_cents) FILTER(WHERE payment_status='paid'),0)::int AS paid_total FROM kap_orders`),
      one(`SELECT count(*) FILTER(WHERE status IN ('open','pending'))::int AS open,count(*) FILTER(WHERE priority IN ('urgent','high') AND status='open')::int AS urgent FROM kap_tickets`),
      one('SELECT count(*)::int AS total FROM kap_customers'),
      query(`SELECT o.id,o.number,o.status,o.payment_status,o.total_cents,o.created_at,c.first_name,c.last_name,c.email FROM kap_orders o JOIN kap_customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 6`),
      query(`SELECT t.id,t.number,t.subject,t.status,t.priority,t.updated_at,c.email FROM kap_tickets t LEFT JOIN kap_customers c ON c.id=t.customer_id ORDER BY t.updated_at DESC LIMIT 6`)
    ]);return json(res,200,{orders:a,tickets:b,customers:c,recent_orders:d.rows,recent_tickets:e.rows});
  }
  if(p==='/api/products'&&method==='GET')return json(res,200,{items:(await query('SELECT * FROM kap_products ORDER BY title')).rows});
  if(p==='/api/products'&&method==='PATCH'){
    requireRole(user,['owner','manager']);const {data}=await body(req);if(!['draft','ready','archived'].includes(data.status)||!Number.isInteger(data.stock_quantity)||data.stock_quantity<0||data.stock_quantity>1000000)throw bad(400,'Ongeldige productstatus of voorraad');
    const item=await one('UPDATE kap_products SET status=$1,stock_quantity=$2 WHERE sku=$3 RETURNING *',[data.status,data.stock_quantity,clean(data.sku,120)]);if(!item)throw bad(404,'Product niet gevonden');await audit(user.id,'product',null,'updated',{sku:item.sku,status:item.status});return json(res,200,{item});
  }
  if(p==='/api/orders'&&method==='GET'){
    const status=clean(url.searchParams.get('status'),40),search=clean(url.searchParams.get('q'),100);const params=[];let where='WHERE 1=1';
    if(status&&status!=='all'){params.push(status);where+=` AND o.status=$${params.length}`}
    if(search){params.push('%'+search+'%');where+=` AND (c.email ILIKE $${params.length} OR CAST(o.number AS text) ILIKE $${params.length})`}
    const rows=await query(`SELECT o.*,c.email,c.first_name,c.last_name FROM kap_orders o JOIN kap_customers c ON c.id=o.customer_id ${where} ORDER BY o.created_at DESC LIMIT 100`,params);return json(res,200,{items:rows.rows});
  }
  if(p==='/api/orders'&&method==='POST'){
    requireRole(user,['owner','manager','fulfillment']);const {data}=await body(req);const item=await createOrder(data,user.id);return json(res,201,{item});
  }
  const om=p.match(/^\/api\/orders\/([0-9a-f-]{36})$/);
  if(om&&method==='GET'){
    const item=await one(`SELECT o.*,row_to_json(c) AS customer FROM kap_orders o JOIN kap_customers c ON c.id=o.customer_id WHERE o.id=$1`,[om[1]]);if(!item)throw bad(404,'Order niet gevonden');
    const [items,events]=await Promise.all([query('SELECT * FROM kap_order_items WHERE order_id=$1',[om[1]]),query("SELECT e.*,u.name AS actor FROM kap_events e LEFT JOIN kap_users u ON u.id=e.actor_id WHERE e.entity_type='order' AND e.entity_id=$1 ORDER BY e.created_at DESC",[om[1]])]);return json(res,200,{item,items:items.rows,events:events.rows});
  }
  if(om&&method==='PATCH'){
    requireRole(user,['owner','manager','fulfillment']);const {data}=await body(req);const previous=await one('SELECT * FROM kap_orders WHERE id=$1',[om[1]]);if(!previous)throw bad(404,'Order niet gevonden');
    const status=data.status??previous.status,fulfillment=data.fulfillment_status??previous.fulfillment_status;
    if(!ORDER_STATUS.includes(status)||!['unfulfilled','partial','fulfilled','returned'].includes(fulfillment))throw bad(400,'Ongeldige status');
    if(status==='shipped'&&previous.payment_status!=='paid')throw bad(409,'Verzending vereist een bevestigde betaling');
    if(previous.status==='cancelled'&&status!=='cancelled')throw bad(409,'Geannuleerde orders zijn vergrendeld');
    const item=await one('UPDATE kap_orders SET status=$1,fulfillment_status=$2,tracking_code=$3,carrier=$4,updated_at=now() WHERE id=$5 RETURNING *',[status,fulfillment,clean(data.tracking_code??previous.tracking_code,100),clean(data.carrier??previous.carrier,100),om[1]]);
    await audit(user.id,'order',om[1],'status_updated',{from:previous.status,to:status,fulfillment});return json(res,200,{item});
  }
  if(p==='/api/customers'&&method==='GET'){
    const search=clean(url.searchParams.get('q'),100);const rows=await query(`SELECT c.*,count(o.id)::int AS order_count,coalesce(sum(o.total_cents),0)::int AS lifetime_cents FROM kap_customers c LEFT JOIN kap_orders o ON o.customer_id=c.id WHERE ($1='' OR c.email ILIKE '%'||$1||'%' OR c.first_name ILIKE '%'||$1||'%' OR c.last_name ILIKE '%'||$1||'%') GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`,[search]);return json(res,200,{items:rows.rows});
  }
  if(p==='/api/customers'&&method==='POST'){
    const {data}=await body(req);const client=await pool.connect();try{const item=await ensureCustomer(client,data);await audit(user.id,'customer',item.id,'upserted');return json(res,201,{item})}finally{client.release()}
  }
  const cm=p.match(/^\/api\/customers\/([0-9a-f-]{36})$/);
  if(cm&&method==='GET'){
    const item=await one('SELECT * FROM kap_customers WHERE id=$1',[cm[1]]);if(!item)throw bad(404,'Klant niet gevonden');
    const [orders,tickets]=await Promise.all([query('SELECT * FROM kap_orders WHERE customer_id=$1 ORDER BY created_at DESC',[cm[1]]),query('SELECT * FROM kap_tickets WHERE customer_id=$1 ORDER BY created_at DESC',[cm[1]])]);return json(res,200,{item,orders:orders.rows,tickets:tickets.rows});
  }
  if(p==='/api/tickets'&&method==='GET'){
    const status=clean(url.searchParams.get('status'),30),q=clean(url.searchParams.get('q'),100);const params=[];let where='WHERE 1=1';
    if(status&&status!=='all'){params.push(status);where+=` AND t.status=$${params.length}`}
    if(q){params.push('%'+q+'%');where+=` AND (t.subject ILIKE $${params.length} OR c.email ILIKE $${params.length})`}
    return json(res,200,{items:(await query(`SELECT t.*,c.email,c.first_name,c.last_name,u.name AS assignee FROM kap_tickets t LEFT JOIN kap_customers c ON c.id=t.customer_id LEFT JOIN kap_users u ON u.id=t.assigned_to ${where} ORDER BY CASE WHEN t.priority='urgent' THEN 0 WHEN t.priority='high' THEN 1 ELSE 2 END,t.updated_at DESC LIMIT 100`,params)).rows});
  }
  if(p==='/api/tickets'&&method==='POST'){
    const {data}=await body(req);let customerId=data.customer_id||null;
    if(data.customer_email){const client=await pool.connect();try{const c=await ensureCustomer(client,{email:data.customer_email});customerId=c.id}finally{client.release()}}
    const item=await one('INSERT INTO kap_tickets(id,customer_id,order_id,subject,priority,category) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[uid(),customerId,data.order_id||null,clean(data.subject,250)||'Klantvraag',['low','normal','high','urgent'].includes(data.priority)?data.priority:'normal',clean(data.category,50)||'question']);
    await audit(user.id,'ticket',item.id,'created');return json(res,201,{item});
  }
  const tm=p.match(/^\/api\/tickets\/([0-9a-f-]{36})$/);
  if(tm&&method==='GET'){
    const item=await one(`SELECT t.*,c.email,c.first_name,c.last_name FROM kap_tickets t LEFT JOIN kap_customers c ON c.id=t.customer_id WHERE t.id=$1`,[tm[1]]);if(!item)throw bad(404,'Ticket niet gevonden');
    const messages=await query('SELECT m.*,u.name AS actor FROM kap_messages m LEFT JOIN kap_users u ON u.id=m.created_by WHERE ticket_id=$1 ORDER BY created_at ASC',[tm[1]]);return json(res,200,{item,messages:messages.rows});
  }
  if(tm&&method==='PATCH'){
    const {data}=await body(req);const item=await one(`UPDATE kap_tickets SET status=$1,priority=$2,assigned_to=$3,updated_at=now() WHERE id=$4 RETURNING *`,[
      TICKET_STATUS.includes(data.status)?data.status:'open',['low','normal','high','urgent'].includes(data.priority)?data.priority:'normal',data.assigned_to||null,tm[1]]);
    if(!item)throw bad(404,'Ticket niet gevonden');await audit(user.id,'ticket',item.id,'updated',{status:item.status,priority:item.priority});return json(res,200,{item});
  }
  const mm=p.match(/^\/api\/tickets\/([0-9a-f-]{36})\/messages$/);
  if(mm&&method==='POST'){
    const {data}=await body(req);const ticket=await one(`SELECT t.*,c.email FROM kap_tickets t LEFT JOIN kap_customers c ON c.id=t.customer_id WHERE t.id=$1`,[mm[1]]);
    if(!ticket)throw bad(404,'Ticket niet gevonden');const message=clean(data.body,20000);
    if(!message)throw bad(400,'Leeg bericht');const isReply=data.direction==='outbound';
    if(isReply&&(demoMode||!process.env.KAP_MAIL_API_KEY||!validEmail(process.env.KAP_FROM_EMAIL)))throw bad(409,'KAP.-mailprovider in deze omgeving niet actief; het bericht is niet verzonden');
    if(isReply&&!validEmail(ticket.email))throw bad(409,'Geen geldig klantadres');
    const messageId=uid();
    let item=await one('INSERT INTO kap_messages(id,ticket_id,direction,body,sender,created_by,delivery_status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[messageId,mm[1],isReply?'outbound':'note',message,isReply?process.env.KAP_FROM_EMAIL:user.name,user.id,isReply?'sending':'internal']);
    if(isReply){
      try{
        const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.KAP_MAIL_API_KEY,'Content-Type':'application/json','Idempotency-Key':messageId},body:JSON.stringify({from:process.env.KAP_FROM_EMAIL,to:[ticket.email],subject:'Re: '+ticket.subject,text:message})});
        if(!response.ok)throw new Error('provider rejected');
        const accepted=await response.json();
        item=await one('UPDATE kap_messages SET delivery_status=$1,external_id=$2 WHERE id=$3 RETURNING *',['provider_accepted',accepted.id||null,messageId]);
      }catch{
        await query('UPDATE kap_messages SET delivery_status=$1 WHERE id=$2',['failed_or_unknown',messageId]);
        throw bad(502,'Verzending niet bevestigd; bericht staat als mislukt/onbekend geregistreerd. Controleer de provider voor opnieuw versturen.');
      }
    }
    await query('UPDATE kap_tickets SET updated_at=now(),status=$1 WHERE id=$2',[isReply?'pending':ticket.status,mm[1]]);await audit(user.id,'ticket',mm[1],isReply?'reply_provider_accepted':'note_added');return json(res,201,{item});
  }
  if(p==='/api/returns'&&method==='GET')return json(res,200,{items:(await query(`SELECT r.*,o.number AS order_number,c.email FROM kap_returns r JOIN kap_orders o ON o.id=r.order_id JOIN kap_customers c ON c.id=o.customer_id ORDER BY r.created_at DESC LIMIT 100`)).rows});
  if(p==='/api/returns'&&method==='POST'){
    const {data}=await body(req);const order=await one('SELECT id FROM kap_orders WHERE id=$1',[data.order_id]);if(!order)throw bad(404,'Order niet gevonden');
    const item=await one('INSERT INTO kap_returns(id,order_id,reason,notes) VALUES($1,$2,$3,$4) RETURNING *',[uid(),order.id,clean(data.reason,1000)||'Niet opgegeven',clean(data.notes,2000)]);await audit(user.id,'return',item.id,'created');return json(res,201,{item});
  }
  const rm=p.match(/^\/api\/returns\/([0-9a-f-]{36})$/);
  if(rm&&method==='PATCH'){
    const {data}=await body(req);if(!RETURN_STATUS.includes(data.status)||!['pending','replacement','refund','no_refund'].includes(data.resolution))throw bad(400,'Ongeldige retourstatus');
    const item=await one('UPDATE kap_returns SET status=$1,resolution=$2,notes=$3,updated_at=now() WHERE id=$4 RETURNING *',[data.status,data.resolution,clean(data.notes,2000),rm[1]]);if(!item)throw bad(404,'Retour niet gevonden');
    await audit(user.id,'return',item.id,'updated',{status:item.status,resolution:item.resolution,financial_action:false});return json(res,200,{item,note:'Een terugbetaling is hiermee niet daadwerkelijk uitgevoerd.'});
  }
  if(p==='/api/templates'&&method==='GET')return json(res,200,{items:(await query('SELECT * FROM kap_templates ORDER BY category,title')).rows});
  if(p==='/api/templates'&&method==='POST'){
    requireRole(user,['owner','manager']);const {data}=await body(req);const item=await one('INSERT INTO kap_templates(id,title,category,subject,body) VALUES($1,$2,$3,$4,$5) RETURNING *',[uid(),clean(data.title,100),clean(data.category,60)||'general',clean(data.subject,250),clean(data.body,5000)]);return json(res,201,{item});
  }
  if(p==='/api/team'&&method==='GET')return json(res,200,{items:(await query('SELECT id,email,name,role,active,created_at FROM kap_users ORDER BY created_at')).rows});
  if(p==='/api/team'&&method==='POST'){
    requireRole(user,['owner']);const {data}=await body(req);if(!validEmail(data.email)||!['manager','support','fulfillment'].includes(data.role)||String(data.password||'').length<14)throw bad(400,'Geldige gegevens en tijdelijk wachtwoord van 14+ tekens vereist');
    const item=await one('INSERT INTO kap_users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,email,name,role,active',[uid(),data.email.toLowerCase(),clean(data.name,100),passhash(data.password),data.role]);await audit(user.id,'user',item.id,'created',{role:item.role});return json(res,201,{item});
  }
  if(p==='/api/activity'&&method==='GET')return json(res,200,{items:(await query('SELECT e.*,u.name AS actor FROM kap_events e LEFT JOIN kap_users u ON u.id=e.actor_id ORDER BY e.created_at DESC LIMIT 100')).rows});
  if(p==='/api/config'&&method==='GET')return json(res,200,{brand:'KAP.',shop:process.env.KAP_SHOP_ORIGIN||null,mail_ready:!demoMode&&!!(process.env.KAP_MAIL_API_KEY&&process.env.KAP_FROM_EMAIL),inbound_ready:!demoMode&&!!process.env.KAP_INBOUND_SECRET,checkout_ready:false,data_isolated:true,demo_mode:demoMode});
  throw bad(404,'Endpoint niet gevonden');
}
const server=http.createServer((req,res)=>handler(req,res).catch(error=>{
  const code=[400,401,403,404,405,409,413,415,429,502,503].includes(error.code)?error.code:500;
  if(code===500)console.error('KAP. request error',error);
  if(!res.headersSent)json(res,code,{error:code===500?'Interne fout':error.message});else res.end();
}));
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  migrate().then(()=>server.listen(PORT,'0.0.0.0',()=>console.log(`KAP. Operations listening on ${PORT}`))).catch(e=>{console.error('KAP. startup failed',e);process.exitCode=1});
}
// Test seam is not an HTTP capability; only the test process can inject an in-memory SQL driver.
export const setDatabaseForTests = driver => {if(process.env.NODE_ENV!=='test')throw new Error('Test database injection disabled');pool=driver};
export { server, passhash, passcheck, webhookVerified, clean, positive, validEmail, migrate };
