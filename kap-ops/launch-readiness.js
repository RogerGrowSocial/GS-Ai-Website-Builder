/** Read-only launch checklist. Never treat a demo, a toggle, or a draft as proof of compliance. */
export function launchReadiness({ demo, hasPersistentDatabase, products, config }) {
  const approved = new Set((config.approvedSkus || '').split(',').map(s => s.trim()).filter(Boolean));
  const productVerified = config.supplierVerified && config.safetyVerified && config.weeeVerified && config.pricesVerified;
  const sellable = products.filter(p => p.status === 'ready' && p.stock_quantity > 0 && approved.has(p.sku) && productVerified);
  const checks = [
    { id:'supplier', category:'Product', title:'Leverancier en inkoop bevestigd', ready:config.supplierVerified,
      detail:'Definitief model, leverancier, inkoopprijs, garantieafhandeling en leverbelofte schriftelijk vastleggen.' },
    { id:'safety', category:'Product', title:'Productveiligheid en EU-documentatie', ready:config.safetyVerified,
      detail:'Controleer originele productdocumenten, conformiteitsverklaring, technisch dossier, handleiding en verplichte labels voor verkoop onder eigen merk.' },
    { id:'recycling', category:'Product', title:'E-waste en producentenverantwoordelijkheid', ready:config.weeeVerified,
      detail:'Controleer de registratie, bijdrage en oud-apparaat-innameplicht voor elektrische apparatuur.' },
    { id:'prices', category:'Product', title:'Definitieve prijzen en marge', ready:config.pricesVerified,
      detail:'Bevestig verkoopprijzen inclusief btw en marge ná inkoop, verzending, betalingskosten, schade en retouren.' },
    { id:'catalog', category:'Product', title:'Minimaal één goedgekeurd artikel met voorraad', ready:sellable.length > 0,
      detail:'Standaard staan alle voorbeeldproducten op concept. Vrijgave vereist een expliciet geverifieerde SKU.' },
    { id:'data', category:'Techniek', title:'Blijvende order- en klantopslag', ready:!demo && hasPersistentDatabase,
      detail:'De gratis Studio-demo wist gegevens bij herstart en mag geen echte bestellingen of klantdata bewaren. Back-ups apart controleren.' },
    { id:'payments', category:'Techniek', title:'Betaalprovider en echte checkout', ready:false,
      detail:'Betaling, bedragcontrole, webhook, mislukte betaling, dubbele events en terugbetaling moeten eerst live en end-to-end getest zijn.' },
    { id:'mail', category:'Techniek', title:'Bestelbevestigingen en klantenservice-mail', ready:!demo && config.mailConfigured,
      detail:'Verzenden vanaf een eigen KAP.-mailadres, aflevering en antwoorden ontvangen moeten getest worden.' },
    { id:'legal', category:'Verkoop', title:'Bedrijfsgegevens en consumentenvoorwaarden', ready:config.legalVerified,
      detail:'Verkoper, KvK, btw-id, bereikbaarheid, privacy, voorwaarden, wettelijke garantie en herroepingsknop afronden.' },
    { id:'shipping', category:'Verkoop', title:'Levering, retouren en serviceproces', ready:config.shippingVerified,
      detail:'Concrete levertijden, verzendtarieven, retouradres, retourkosten, 14 dagen bedenktijd en oud-apparaat-inname tonen.' },
    { id:'live', category:'Verkoop', title:'Definitieve webshop publiceren en controleren', ready:false,
      detail:'Noindex pas na alle controles verwijderen; mobiel en desktop testen, inclusief succesvolle en mislukte testbetaling.' }
  ];
  const ready = checks.filter(c => c.ready).length;
  return {
    summary:{ ready, total:checks.length, blocked:checks.length-ready, live:false },
    checks, products:{total:products.length,sellable:sellable.length},
    warning:demo?'Tijdelijke demo: wijzigingen en testorders verdwijnen bij een herstart. Geen echte persoonsgegevens invoeren.':'Een groene technische controle vervangt geen daadwerkelijke product- of juridische verificatie.'
  };
}
