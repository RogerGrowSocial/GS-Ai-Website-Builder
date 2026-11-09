/* KAP. backoffice client: private deployment ONLY. Access enforced by Supabase RLS.
No secret keys are used in the browser. This console does not send email or take payments. */
(function(){
"use strict";
const host=document.getElementById("app");
const c=window.KAP_BACKOFFICE||{};
const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(c.url||"")&&/^sb_publishable_/.test(c.publishableKey||"")&&!c.publishableKey.includes("REPLACE");
const state={token:null,role:null,tab:"orders",user:null,orders:[],tickets:[],products:[],metrics:[],loading:false,error:"",filter:"all",modal:null};
const roles=["owner","operations","support"];
const labels={orders:"Bestellingen",tickets:"Klantenservice",products:"Producten",metrics:"Rapportage"};
const safe=s=>String(s===null||s===undefined?"":s).replace(/[&<>"']/g,k=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[k]));
const euro=cents=>new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format((cents||0)/100);
function jwtPayload(token){try{return JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")))}catch(e){return {}}}
async function authSignIn(email,password){
const res=await fetch(c.url+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":c.publishableKey,"Content-Type":"application/json"},body:JSON.stringify({email,password})});
const json=await res.json().catch(()=>({}));
if(!res.ok||!json.access_token)throw Error(json.error_description||json.msg||"Inloggen mislukt.");
const payload=jwtPayload(json.access_token);const role=payload.app_metadata&&payload.app_metadata.kap_role;
if(!roles.includes(role))throw Error("Je hebt geen KAP. beheerdersrechten. Een beheerder moet je rol veilig instellen.");
state.token=json.access_token;state.role=role;state.user=payload.email||email;
try{sessionStorage.setItem("kap_session_token",state.token)}catch(e){}
}
async function db(path,options={}){
if(!configured||!state.token)throw Error("Geen beveiligde databaseverbinding.");
const headers={"apikey":c.publishableKey,"Authorization":"Bearer "+state.token,"Accept":"application/json",...(options.body?{"Content-Type":"application/json"}:{})};
if(options.headers)Object.assign(headers,options.headers);
const res=await fetch(c.url+"/rest/v1/"+path,{...options,headers});
if(res.status===401)throw Error("Sessie verlopen. Log opnieuw in.");
if(!res.ok){const json=await res.json().catch(()=>({}));throw Error(json.message||"Databasefout ("+res.status+").")}
if(res.status===204)return [];
return await res.json();
}
async function load(){
if(!state.token)return;state.loading=true;state.error="";render();
try{
const [orders,tickets,products,metrics]=await Promise.all([
 db("kap_orders?select=id,order_number,status,payment_status,total_cents,placed_at,customer_id&order=placed_at.desc&limit=100"),
 db("kap_support_tickets?select=id,subject,email,status,priority,created_at,updated_at&order=updated_at.desc&limit=100"),
 db("kap_products?select=id,slug,title,sku,status,price_cents,compliance_verified,stock_quantity&order=updated_at.desc&limit=100"),
 db("kap_daily_metrics?select=day,event_name,total_count,total_value_cents&order=day.desc&limit=90")
]);
state.orders=orders;state.tickets=tickets;state.products=products;state.metrics=metrics;
}catch(err){state.error=err.message;state.orders=[];state.tickets=[];state.products=[];state.metrics=[]}
state.loading=false;render();
}
function login(){
host.innerHTML='<div class="loginShell"><div class="loginStory"><span class="logo">KAP.</span><h1>Alles onder<br>controle.</h1><p>Bestellingen, klantenservice, producten en omzet op één plek — uitsluitend toegankelijk voor geautoriseerde medewerkers.</p></div><div class="loginMain"><div class="loginCard"><h2>Inloggen op KAP.</h2><p>Dit is de privé-beheeromgeving. Gebruik je toegewezen beheerdersaccount.</p>'+
(!configured?'<div class="warning">De KAP.-database is nog niet gekoppeld. Deze beheeromgeving is voorbereid, maar verwerkt nog geen bestellingen of klantvragen.</div>':'')+
(state.error?'<div class="error">'+safe(state.error)+'</div>':'')+
'<form id="loginForm"><label>E-mailadres</label><input name="email" type="email" autocomplete="username" required '+(configured?'':'disabled')+'><label>Wachtwoord</label><input name="password" type="password" autocomplete="current-password" required '+(configured?'':'disabled')+'><button type="submit" class="primary" '+(configured?'':'disabled')+'>Beveiligd inloggen</button></form></div></div></div>';
}
function header(){
const roleName=state.role==="owner"?"Eigenaar":state.role==="operations"?"Operations":"Klantenservice";
return '<aside class="sidebar"><a class="logo" href="#">KAP.</a><nav class="sideNav">'+Object.keys(labels).map(k=>'<button data-tab="'+k+'" class="'+(state.tab===k?"active":"")+'">'+labels[k]+'</button>').join("")+'</nav><small>Beveiligde omgeving · '+safe(roleName)+'</small></aside>';
}
function top(){return '<div class="topline"><div><h1>'+labels[state.tab]+'</h1><p>'+safe(state.user)+' · alleen echte databasegegevens</p></div><div class="topActions"><button data-refresh>Vernieuwen</button><button data-logout>Uitloggen</button></div></div>'}
function kpis(){
const npaid=state.orders.filter(o=>o.payment_status==="paid").length;
const revenue=state.orders.filter(o=>o.payment_status==="paid").reduce((sum,o)=>sum+Number(o.total_cents||0),0);
const k=[["Bestellingen",state.orders.length,"Totaal geladen"],["Betaald",npaid,"Bevestigde betalingen"],["Betaalde omzet",euro(revenue),"Voorlopig, excl. terugbetalingen"],["Openstaande tickets",state.tickets.filter(t=>!["closed","resolved"].includes(t.status)).length,"Vraagt opvolging"]];
return '<div class="gridKPI">'+k.map(x=>'<div class="kpi"><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>'+x[2]+'</small></div>').join("")+'</div>';
}
function empty(subject){return '<div class="empty"><strong>Geen '+subject+' gevonden</strong><p>Er worden geen voorbeeldrecords getoond. Nieuwe gegevens verschijnen zodra ze veilig zijn vastgelegd in de KAP.-database.</p></div>'}
function statusSelect(type,id,value){
const options=type==="orders"?["pending_payment","paid","preparing","shipped","delivered","cancelled","refunded"]:["open","in_progress","waiting_customer","resolved","closed"];
const mayEdit=type==="tickets"||["owner","operations"].includes(state.role);
return mayEdit?'<select data-status-type="'+type+'" data-status-id="'+safe(id)+'" aria-label="Status bijwerken">'+options.map(o=>'<option '+(o===value?'selected':'')+' value="'+o+'">'+o.replace(/_/g," ")+'</option>').join("")+'</select>':'<span class="status">'+safe(value)+'</span>';
}
function orders(){
return '<div class="panel"><div class="panelHead"><div><h2>Orderoverzicht</h2><p>Betaling en orderstatus worden van elkaar onderscheiden.</p></div><div class="toolbar"><select data-filter><option value="all">Alle orders</option><option value="pending_payment" '+(state.filter==="pending_payment"?"selected":"")+' >Wacht op betaling</option><option value="paid" '+(state.filter==="paid"?"selected":"")+'>Betaald</option><option value="shipped" '+(state.filter==="shipped"?"selected":"")+'>Verzonden</option></select></div></div><div class="tableWrap">'+(state.orders.length?'<table><thead><tr><th>Order</th><th>Datum</th><th>Bedrag</th><th>Betaling</th><th>Status</th><th></th></tr></thead><tbody>'+state.orders.filter(o=>state.filter==="all"||o.status===state.filter).map(o=>'<tr><td><strong>'+safe(o.order_number)+'</strong></td><td>'+safe((o.placed_at||"").slice(0,10))+'</td><td>'+euro(o.total_cents)+'</td><td><span class="status '+(o.payment_status==="unpaid"?"pending":"")+'">'+safe(o.payment_status)+'</span></td><td>'+statusSelect("orders",o.id,o.status)+'</td><td><button class="rowSave" data-save-status="orders" data-id="'+safe(o.id)+'" '+(["owner","operations"].includes(state.role)?"":"disabled")+'>Opslaan</button></td></tr>').join("")+'</tbody></table>':empty("bestellingen"))+'</div></div>';
}
function tickets(){
return '<div class="panel"><div class="panelHead"><div><h2>Supportinbox</h2><p>Beheer status en interne notities. E-mails worden hier niet automatisch verzonden.</p></div></div><div class="tableWrap">'+(state.tickets.length?'<table><thead><tr><th>Onderwerp</th><th>E-mail</th><th>Prioriteit</th><th>Status</th><th>Notitie</th></tr></thead><tbody>'+state.tickets.map(t=>'<tr><td>'+safe(t.subject)+'</td><td>'+safe(t.email)+'</td><td>'+safe(t.priority)+'</td><td>'+statusSelect("tickets",t.id,t.status)+'</td><td><button class="rowSave" data-note="'+safe(t.id)+'">Open</button> <button class="rowSave" data-save-status="tickets" data-id="'+safe(t.id)+'">Opslaan</button></td></tr>').join("")+'</tbody></table>':empty("supporttickets"))+'</div></div>';
}
function products(){
return '<div class="panel"><div class="panelHead"><div><h2>Assortiment en productstatus</h2><p>Publiceer pas na verificatie van leverancier, EU-conformiteit en productbeeld.</p></div></div><div class="tableWrap">'+(state.products.length?'<table><thead><tr><th>Model</th><th>SKU</th><th>Prijs</th><th>Compliance</th><th>Voorraad</th><th>Status</th></tr></thead><tbody>'+state.products.map(p=>'<tr><td>'+safe(p.title)+'</td><td>'+safe(p.sku||"—")+'</td><td>'+euro(p.price_cents)+'</td><td>'+(p.compliance_verified?"Geverifieerd":"Niet geverifieerd")+'</td><td>'+safe(p.stock_quantity)+'</td><td><span class="status '+(p.status!=="active"?"pending":"")+'">'+safe(p.status)+'</span></td></tr>').join("")+'</tbody></table>':empty("producten"))+'</div></div>';
}
function metrics(){
const count=name=>state.metrics.filter(m=>m.event_name===name).reduce((s,m)=>s+Number(m.total_count||0),0);
const events=["view_item","add_to_cart","view_cart","begin_checkout","purchase"];return '<div class="panel"><div class="panelHead"><div><h2>Conversiefunnel</h2><p>Dit overzicht toont uitsluitend geaggregeerde servergegevens, geen fictieve conversies.</p></div></div><div class="tableWrap"><table><thead><tr><th>Funnelstap</th><th>Aantal</th><th>Opmerking</th></tr></thead><tbody>'+events.map((ev,i)=>'<tr><td>'+["Productbezoeken","Toevoegingen winkelwagen","Winkelwagenbezoeken","Gestarte checkouts","Bevestigde aankopen"][i]+'</td><td>'+count(ev)+'</td><td>'+(i>=3?"Alleen na backend- en betaalintegratie":"Alleen bij gekoppelde meetgegevens")+'</td></tr>').join("")+'</tbody></table></div><div class="warning">Een leeg dashboard betekent niet dat er geen bezoekers zijn. Analytics moet apart worden aangesloten, met toestemming en beveiligde aggregatie.</div></div>';
}
function main(){
host.innerHTML='<div class="shell">'+header()+'<main class="main">'+top()+
(state.error?'<div class="error">'+safe(state.error)+'</div>':'')+
(state.loading?'<div class="warning">Gegevens laden uit de beveiligde database...</div>':kpis()+(state.tab==="orders"?orders():state.tab==="tickets"?tickets():state.tab==="products"?products():metrics()))+
'</main></div>'+(state.modal?noteModal(state.modal):'');
}
function noteModal(id){const t=state.tickets.find(x=>x.id===id);return t?'<div class="modalBackdrop"><div class="modal" role="dialog" aria-modal="true"><h2>Interne notitie</h2><p>Ticket: '+safe(t.subject)+'. Notities zijn alleen zichtbaar voor medewerkers, er wordt geen e-mail verzonden.</p><form id="noteForm" data-ticket="'+safe(id)+'"><label>Notitie</label><textarea name="body" rows="5" minlength="3" maxlength="6000" required></textarea><div class="modalButtons"><button type="button" class="btnLight" data-close-modal>Annuleren</button><button type="submit" class="primary">Notitie bewaren</button></div></form></div></div>':''}
function render(){if(!state.token)return login();main()}
function logout(){state.token=null;state.role=null;state.user=null;state.orders=[];state.tickets=[];try{sessionStorage.removeItem("kap_session_token")}catch(e){}render()}
async function updateStatus(type,id,value){
const statuses=type==="orders"?["pending_payment","preparing","shipped","delivered","cancelled"]:["open","in_progress","waiting_customer","resolved","closed"];
if(!statuses.includes(value))throw Error("Deze status mag niet handmatig worden ingesteld. Betaal- en retourstatus komen uit de betalingsverwerker.");
const collection=type==="orders"?"kap_orders":"kap_support_tickets";
const out=await db(collection+"?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify({status:value,updated_at:new Date().toISOString()})});
if(!Array.isArray(out)||out.length!==1||out[0].status!==value)throw Error("Bijwerken niet bevestigd; controleer de gegevens.");
}
async function saveNote(ticketId,body){
if(body.trim().length<3)throw Error("Schrijf een bruikbare interne notitie.");
const claim=jwtPayload(state.token),created=await db("kap_ticket_messages",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({ticket_id:ticketId,direction:"staff_internal",body,author_id:claim.sub})});
if(!Array.isArray(created)||created.length!==1)throw Error("Notitie niet bevestigd.");
}
host.addEventListener("click",async e=>{
const tab=e.target.closest("[data-tab]");if(tab){state.tab=tab.dataset.tab;state.filter="all";render();return}
if(e.target.closest("[data-logout]")){logout();return}
if(e.target.closest("[data-refresh]")){await load();return}
const note=e.target.closest("[data-note]");if(note){state.modal=note.dataset.note;render();return}
if(e.target.closest("[data-close-modal]")){state.modal=null;render();return}
const save=e.target.closest("[data-save-status]");if(save){const type=save.dataset.saveStatus,id=save.dataset.id;const input=Array.from(host.querySelectorAll("[data-status-id]")).find(x=>x.dataset.statusId===id&&x.dataset.statusType===type);if(!input)return;save.disabled=true;try{await updateStatus(type,id,input.value);await load()}catch(err){state.error=err.message;render()}return}
});
host.addEventListener("change",e=>{if(e.target.matches("[data-filter]")){state.filter=e.target.value;render()}});
host.addEventListener("submit",async e=>{
if(e.target.id==="loginForm"){e.preventDefault();if(!configured)return;const form=e.target;const email=form.querySelector('[name="email"]').value,password=form.querySelector('[name="password"]').value;state.error="";try{await authSignIn(email,password);await load()}catch(err){state.error=err.message;render()}return}
if(e.target.id==="noteForm"){e.preventDefault();const form=e.target;try{await saveNote(form.dataset.ticket,form.querySelector('textarea').value);state.modal=null;await load()}catch(err){state.error=err.message;state.modal=null;render()}return}
});
(async function bootstrap(){
if(!configured){render();return}
try{const saved=sessionStorage.getItem("kap_session_token");if(saved){const claim=jwtPayload(saved);if((claim.exp||0)*1000>Date.now()&&roles.includes(claim.app_metadata&&claim.app_metadata.kap_role)){state.token=saved;state.role=claim.app_metadata.kap_role;state.user=claim.email||"";await load();return}}}catch(err){}
render();
})();
})();
