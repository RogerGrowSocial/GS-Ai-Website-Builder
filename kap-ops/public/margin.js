/** All amounts in EUR. Purchase and cost inputs must be excluding recoverable VAT. */
export function calculateUnitMargin({priceInclVat, purchaseExVat, shippingExVat=0, packagingExVat=0, paymentExVat=0, riskReserveExVat=0, vatRate=0.21}){
  const values=[priceInclVat,purchaseExVat,shippingExVat,packagingExVat,paymentExVat,riskReserveExVat,vatRate];
  if(values.some(v=>!Number.isFinite(v)||v<0)||priceInclVat<=0||vatRate>1)return null;
  const salesExVat=priceInclVat/(1+vatRate);
  const cost=purchaseExVat+shippingExVat+packagingExVat+paymentExVat+riskReserveExVat;
  const contribution=salesExVat-cost;
  return {salesExVat,cost,contribution,marginPercent:contribution/salesExVat*100,breakEvenPriceInclVat:cost*(1+vatRate)};
}
