import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateUnitMargin} from '../public/margin.js';

test('unit economics deduct VAT and all estimated direct costs',()=>{
  const result=calculateUnitMargin({priceInclVat:475,purchaseExVat:200,shippingExVat:20,packagingExVat:5,paymentExVat:1,riskReserveExVat:10});
  assert.ok(Math.abs(result.salesExVat-392.56198)<0.01);
  assert.ok(Math.abs(result.contribution-156.56198)<0.01);
  assert.ok(result.marginPercent>39&&result.marginPercent<41);
});

test('invalid assumptions cannot be reported as profit',()=>{
  assert.equal(calculateUnitMargin({priceInclVat:475,purchaseExVat:-10}),null);
  assert.equal(calculateUnitMargin({priceInclVat:0,purchaseExVat:100}),null);
  assert.equal(calculateUnitMargin({priceInclVat:475,purchaseExVat:NaN}),null);
});
