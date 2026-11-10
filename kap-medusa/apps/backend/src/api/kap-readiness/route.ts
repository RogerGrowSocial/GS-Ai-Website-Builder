import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// Staging-only readiness information, intentionally never reports that live
// checkout, refunds or fulfillment are ready.
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  return res.status(200).json({
    service: "kap-commerce",
    commerce_engine: "medusa-v2",
    checkout_enabled: false,
    payments_enabled: false,
  })
}
