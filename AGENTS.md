# AGENTS.md

Machine-readable instructions for AI coding agents.

## Tech Stack

- **Framework**: Next.js 15 App Router, React 19, TypeScript (strict)
- **Styling**: Tailwind CSS v4 + shadcn/ui (new-york style, neutral colors)
- **Database**: Neon Postgres + Drizzle ORM (`@neondatabase/serverless` driver)
- **Storage**: Vercel Blob (`@vercel/blob`)
- **AI**: Vercel AI SDK with OpenAI (`@ai-sdk/openai`, `ai`)
- **Deployment**: Vercel
- **Path Aliases**: `@/` → `src/`

## Setup

This project was scaffolded by the `campco-product` Claude Code plugin's `/new-project` skill. Database and Blob storage were provisioned through Vercel Marketplace during scaffolding.

## Scripts

```bash
npm run dev         # Start dev server (Turbopack)
npm run build       # Production build
npm run lint        # ESLint
npm run typecheck   # TypeScript check
npm run db:push     # Push schema changes to DB (dev)
npm run db:generate # Generate migrations (prod)
npm run db:migrate  # Run migrations (prod)
npm run db:studio   # Drizzle Studio GUI
```

## Patterns

### Database

Define tables in `src/lib/schema.ts`. Query via `@/lib/db`:

```typescript
import { db } from "@/lib/db";
import { yourTable } from "@/lib/schema";
import { eq } from "drizzle-orm";

const rows = await db.select().from(yourTable).where(eq(yourTable.id, id));
```

### AI (Vercel AI SDK, provider-agnostic)

Never import a provider adapter or name a model in feature code. Ask the
wrapper for a *role*; provider selection lives only in `src/lib/ai/model.ts`
(`AI_PROVIDER` env, default `openai`). Add a feature as a schema + prompt and
wire it with the shared route factory:

```typescript
// src/lib/ai/features/thing.ts — pure, unit-testable
export const thingBody = z.object({ ... });
export const thingOut = z.object({ ... });
export const thingSystem = "…";
export const buildThingPrompt = (i) => `…`;

// src/app/api/ai/thing/route.ts
export const POST = aiObjectRoute({ bodySchema: thingBody, outSchema: thingOut,
  system: thingSystem, buildPrompt: buildThingPrompt }); // or aiTextRoute for prose
```

The factory (`src/lib/ai/handler.ts`) handles session-gating, the `AI_FEATURES`
flag, Zod validation, and graceful failure (401/503/400/502). See
`docs/phase-1-ai-plan.md`. Run tests with `npm run test` (Vitest).

### Blob Storage

```typescript
import { put, get, del } from "@vercel/blob";

const blob = await put("file.jpg", file, { access: "public" });
```

## Environment Variables

Auto-provisioned by `vercel env pull` after scaffolding:
- `POSTGRES_URL` — Neon Postgres connection string
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token

Add manually:
- `OPENAI_API_KEY` — from https://platform.openai.com/api-keys

## Development Workflow

Use the `campco-product` plugin's workflow loop for any non-trivial feature:

1. `/brainstorm <idea>` — explore requirements
2. `/plan` — design architecture and decompose tasks
3. `/work` — implement via TDD
4. `/review` — security + quality check
5. `/compound` — document learnings

For trivial changes, edit directly.
