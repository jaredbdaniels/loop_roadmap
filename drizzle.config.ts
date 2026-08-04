import type { Config } from "drizzle-kit";

// Load Vercel-pulled local env (`vercel env pull` writes .env.local).
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no local env file yet — fine in CI/prod where vars are already set */
}

export default {
  dialect: "postgresql",
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
} satisfies Config;
