/* KAP. privacy-first event adapter. No third-party script is loaded by this file.
   A Google Tag Manager/GA4 integration can read window.dataLayer after explicit consent.
   No real checkout or purchase events fire until verified server-side payment integration. */
(function(w){
  "use strict";
  var choice="unknown", memory=[],MAX=80;
  try{choice=w.localStorage.getItem("kap_analytics_consent")||"unknown"}catch(e){}
  var allowedNames={
    page_view:1,view_item:1,view_item_list:1,select_item:1,
    add_to_cart:1,remove_from_cart:1,view_cart:1,fit_check_completed:1,
    begin_checkout:1,purchase:1,refund:1
  };
  function track(name, details){
    if(!allowedNames[name])return false;
    var event={event:name,timestamp:new Date().toISOString()};
    var safe=details||{};
    ["item_id","item_name","price","quantity","currency","item_count","value","page_type"].forEach(function(k){
      if(safe[k]!==undefined&&safe[k]!==null)event[k]=safe[k];
    });
    memory.push(event);if(memory.length>MAX)memory.shift();
    if(choice!=="granted")return false;
    w.dataLayer=w.dataLayer||[];
    var d={event:name};
    var commerce=["view_item","view_item_list","select_item","add_to_cart","remove_from_cart","view_cart","begin_checkout","purchase","refund"].includes(name);
    if(commerce){
      var cleanItems=Array.isArray(safe.items)?safe.items.filter(function(i){return i&&typeof i.item_id==="string"}).slice(0,30).map(function(i){return {item_id:String(i.item_id),item_name:String(i.item_name||i.item_id),price:Number(i.price||0),quantity:Math.max(1,Number(i.quantity||1))}}):[];
      if(!cleanItems.length&&safe.item_id)cleanItems=[{item_id:String(safe.item_id),item_name:String(safe.item_name||safe.item_id),price:Number(safe.price||0),quantity:Math.max(1,Number(safe.quantity||1))}];
      d.ecommerce={currency:String(safe.currency||"EUR"),value:Number(safe.value||0),items:cleanItems};
      if(name==="purchase"||name==="refund")return false; // server-only; never let the browser invent financial conversions
      w.dataLayer.push({ecommerce:null});
    }else{
      Object.keys(event).forEach(function(k){if(k!=="event"&&k!=="timestamp")d[k]=event[k]});
    }
    w.dataLayer.push(d);
    return true;
  }
  function setConsent(next){
    choice=next==="granted"?"granted":"denied";
    try{w.localStorage.setItem("kap_analytics_consent",choice)}catch(e){}
    return choice;
  }
  w.KAPTelemetry={track:track,getConsent:function(){return choice},setConsent:setConsent,debugEvents:function(){return memory.slice()}};
})(window);
