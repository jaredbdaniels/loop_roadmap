import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error("POSTGRES_URL environment variable is not set");
}

// Pool-based driver: pairs correctly with drizzle-orm/neon-serverless and
// supports transactions (Better Auth relies on them).
const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
