import assert from "node:assert/strict"
import { medusaAdminRead } from "../../../../kap-ops/medusa-client.js"

const base = "http://127.0.0.1:9000"
const email = process.env.CI_MEDUSA_ADMIN_EMAIL
const password = process.env.CI_MEDUSA_ADMIN_PASSWORD

if (!email || !password) throw new Error("CI Medusa admin credentials are required")

// Authenticate against the actual, isolated Medusa instance. Never print
// tokens, passwords or upstream responses in CI logs.
const login = await fetch(base + "/auth/user/emailpass", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
})
if (!login.ok) throw new Error("Medusa test admin login failed with HTTP " + login.status)
const loginData = await login.json()
assert.ok(typeof loginData.token === "string" && loginData.token.length > 20)

const createKey = await fetch(base + "/admin/api-keys", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer " + loginData.token,
  },
  body: JSON.stringify({ title: "Disposable KAP Studio CI connector", type: "secret" }),
})
if (!createKey.ok) throw new Error("Medusa test API key creation failed with HTTP " + createKey.status)
const keyData = await createKey.json()
assert.ok(typeof keyData.api_key?.token === "string")

const env = {
  KAP_MEDUSA_URL: base,
  KAP_MEDUSA_SECRET_API_KEY: keyData.api_key.token,
}

// This is the same server-only adapter KAP Studio actually imports.
const orders = await medusaAdminRead("orders", { env })
const products = await medusaAdminRead("products", { env })
assert.ok(Array.isArray(orders.orders))
assert.ok(Array.isArray(products.products))
assert.equal(orders.count, 0)
assert.equal(products.count, 0)

const secondPage = await medusaAdminRead("orders", { env, offset: 30 })
assert.equal(secondPage.offset, 30)

await assert.rejects(
  medusaAdminRead("orders", {
    env: { ...env, KAP_MEDUSA_SECRET_API_KEY: "not-a-valid-secret-key" },
  }),
  (error) => error.code === 502 && !error.message.includes("key"),
)

console.log("KAP Studio -> real Medusa Admin API: login, API key, orders, products and unauthorized access passed")
