import { headers } from "next/headers";
import { auth } from "./auth";

// Dev-only sign-in bypass so the app runs on localhost before Google OAuth is
// set up. Strictly gated: NEVER active in production, and only when DEV_AUTH=1.
function devSession() {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.DEV_AUTH !== "1") return null;
  return {
    user: {
      id: "dev-user",
      email: "dev@campminder.com",
      name: "Dev User",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>;
}

// Returns the current session, or null. Used by API routes to gate access.
export async function getSession() {
  const dev = devSession();
  if (dev) return dev;
  return auth.api.getSession({ headers: await headers() });
}
