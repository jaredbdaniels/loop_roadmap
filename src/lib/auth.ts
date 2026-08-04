import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { db } from "./db";
import { account, session, user, verification } from "./schema";

// Only @campminder.com Google accounts may sign in. Enforced at user-creation
// time (the only moment a new identity enters the system); existing users are
// therefore always campminder by construction.
export const ALLOWED_DOMAIN = "campminder.com";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  // Google is registered only when its keys are present, so the app boots in
  // local dev (DEV_AUTH) without OAuth credentials configured yet.
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Hint Google to show only the Campminder workspace; hard check below.
            hostedDomain: ALLOWED_DOMAIN,
          },
        }
      : {},
  databaseHooks: {
    user: {
      create: {
        before: async (u: { email: string }) => {
          const email = (u.email || "").toLowerCase();
          if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
            throw new APIError("FORBIDDEN", {
              message: `Loop is restricted to @${ALLOWED_DOMAIN} accounts.`,
            });
          }
          return { data: u };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
