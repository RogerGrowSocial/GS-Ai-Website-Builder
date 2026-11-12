import { defineConfig, loadEnv } from "@medusajs/framework/utils"
import { kapDatabaseUrl } from "./kap-db-url.mjs"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

// KAP Medusa runs as an isolated commerce system. Never connect to the KAP
// Studio / GrowSocial database, and never silently fall back to demo secrets.
const databaseUrl = kapDatabaseUrl()
const required = ["JWT_SECRET", "COOKIE_SECRET", "STORE_CORS", "ADMIN_CORS", "AUTH_CORS"]
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required commerce configuration: ${name}`)
}
if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) {
  throw new Error("REDIS_URL is required for production commerce")
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl,
    redisUrl: process.env.REDIS_URL,
    workerMode: (process.env.WORKER_MODE || "shared") as "shared" | "server" | "worker",
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET!,
      cookieSecret: process.env.COOKIE_SECRET!,
    },
  },
  // Disable Vite admin build in temporary smoke tests. Enable the admin UI
  // explicitly for staging/production onboarding and secret-key creation.
  admin: { disable: process.env.KAP_MEDUSA_DISABLE_ADMIN === "true" },
})
