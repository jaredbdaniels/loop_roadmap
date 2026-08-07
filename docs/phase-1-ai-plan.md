# Phase 1 — AI Quick Wins: Implementation Plan

_Loop roadmap app · target branch `claude/ai-features-brainstorm-m24mc2`_

## Why these six

Phase 1 is the top-left of the cost × impact matrix (tracked separately): the
highest-leverage AI features, where **leverage = impact ÷ cost**. Every one of
them is a single
model call over data Loop **already stores** — no new tables, no embeddings, no
background jobs. The `ai` SDK is already a dependency; what's missing is a thin,
provider-agnostic wrapper and a shared route pattern, which this phase builds
once and reuses six times.

| # | Feature | Stage | Impact | Cost | Leverage | Surfaces in |
|---|---------|-------|:------:|:----:|:--------:|-------------|
| 1 | RICE score suggester | Solutioning | 9 | 3 | **3.00** | `DetailModal` score editor |
| 2 | Problem-statement critique | Solutioning | 6 | 2 | **3.00** | `DetailModal` / `CaptureModal` |
| 3 | Explain this ranking | Cross-cutting | 5 | 2 | 2.50 | rank badge popover |
| 4 | KR sharpener | Solutioning | 7 | 3 | 2.33 | `DetailModal` KR editor |
| 5 | Idea intake copilot | Capture | 8 | 4 | 2.00 | `CaptureModal` |
| 6 | Roadmap narrative / exec summary | Releasing | 7 | 4 | 1.75 | `ShareModal` / summary action |

**Non-goals for Phase 1** (deferred to later phases): embeddings / `pgvector`
dedup, a dependency graph, natural-language board query, write-back to ADO or
Notion, and any agent that _acts_ without a human accepting the output.

---

## Architectural principles

These hold for all six features and are the reason the per-feature cost is low.

1. **Suggestions are drafts, never writes.** Every endpoint _returns_ a
   suggestion; the human accepts, edits, or discards it in the UI. Nothing is
   persisted by the AI. When an accepted suggestion becomes data (a captured
   idea, a generated prototype), it is stamped `Submitter.type: "agent"` /
   `Prototype.createdBy` — a distinction the domain **already models**.
2. **Small, relevant inputs.** Send only the fields a feature needs (e.g. the
   RICE suggester gets `title`, `problemStatement`, `mission`, `description`) —
   never the whole database. Cheaper, faster, and less to leak.
3. **Structured output, validated.** Use `generateObject` with a `zod` schema so
   the model's response is type-checked at the boundary; the SDK retries on a
   schema miss. Prose-only features (explain-ranking, exec summary) use
   `generateText`.
4. **Provider-agnostic.** Call sites ask for a _role_ (`"fast"` | `"reasoning"`),
   never a concrete model. One file (`src/lib/ai/model.ts`) maps role → model
   for the active provider. Swapping OpenAI ↔ Anthropic is a one-file change.
5. **Graceful degradation.** If the AI provider is unreachable or no key is
   configured, the feature disables itself (button hidden/disabled + a toast) —
   the rest of Loop is unaffected. This mirrors the existing `isMissingRelation`
   pattern in `store.ts`, where a not-yet-migrated feature simply doesn't show.
6. **Gated like every other mutation.** Routes require `getSession()` (401
   otherwise) and are never exposed on the read-only `/share/<token>` view
   (guarded by the client `readOnly` flag).

---

## Foundation (build once, Task 0)

### Provider-agnostic model factory — `src/lib/ai/model.ts`

```ts
import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// The app asks for a ROLE, never a concrete model, so the provider is a
// one-file swap. Selected by AI_PROVIDER (default "openai" — the scaffolded
// adapter). To add Claude: `npm i @ai-sdk/anthropic`, then a case below.
export type ModelRole = "fast" | "reasoning";

export function model(role: ModelRole = "fast"): LanguageModel {
  const provider = process.env.AI_PROVIDER ?? "openai";
  switch (provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openai(role === "reasoning" ? "gpt-5" : "gpt-5-mini");
    }
    // case "anthropic": {
    //   const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    //   return anthropic(role === "reasoning" ? "claude-opus-4-8" : "claude-haiku-4-5");
    // }
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}

export function aiEnabled(): boolean {
  const provider = process.env.AI_PROVIDER ?? "openai";
  if (provider === "openai") return !!process.env.OPENAI_API_KEY;
  if (provider === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  return false;
}
```

### Structured-suggestion helper — `src/lib/ai/suggest.ts`

```ts
import "server-only";
import { generateObject } from "ai";
import type { z } from "zod";
import { model, type ModelRole } from "./model";

export async function suggest<T>(opts: {
  role?: ModelRole;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  const { object } = await generateObject({
    model: model(opts.role ?? "fast"),
    schema: opts.schema,
    system: opts.system,
    prompt: opts.prompt,
  });
  return object;
}
```

### Route convention — `src/app/api/ai/<feature>/route.ts`

Every AI route is the same six lines of ceremony (mirrors `api/items`):

```ts
export const dynamic = "force-dynamic";
export const maxDuration = 30;               // model calls can be slow

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  try {
    const out = await suggest({ schema: OutSchema, system, prompt: build(parsed.data) });
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "ai_unavailable" }, { status: 502 });
  }
}
```

### Client plumbing

- **`src/components/loop/useAiSuggestion.ts`** — a small hook wrapping the fetch:
  `{ run, loading, error }`. On non-OK it fires the existing `toast(msg, true)`.
- **`<SuggestButton>`** — a shared "✨ Suggest" button (lucide `Sparkles`),
  disabled while `loading` and hidden when `!aiEnabled` (surfaced to the client
  via a field on `/api/items` GET, or a tiny `/api/ai/status` probe).
- No changes to the server or client **store** — AI writes nothing directly; the
  user's acceptance flows through the existing `createItem` / `updateItem`.

### Config & docs

- Env: `AI_PROVIDER` (default `openai`), keep `OPENAI_API_KEY`; optional
  `AI_FEATURES=1` master flag for staged rollout. Document in `AGENTS.md`.
- Update `AGENTS.md` **AI** section from "OpenAI" to the role-based wrapper.

**Acceptance:** `npm run lint && npm run typecheck` clean; hitting any `/api/ai/*`
route while signed out returns 401; with no key configured, `aiEnabled()` is
`false` and buttons don't render.

---

## Per-feature specs

### 1. RICE score suggester  ·  `POST /api/ai/rice`
- **Input:** `title`, `problemStatement`, `mission`, `description`.
- **Output schema:** `{ reach, confidence, strategicFit: int 1–5, rationale: { reach, confidence, strategicFit: string } }`
  (matches the app's 0–5 score sliders).
  _Note:_ `votes` is a human signal — **not** AI-suggested. Weights are applied
  by the existing `computeRank`, untouched.
- **Prompt:** system explains Campminder's RICE-ish model and the 1–5 meaning of
  each axis; user message is the item's framing. Ask for one-sentence rationale
  per axis.
- **UI:** "✨ Suggest scores" in the `DetailModal` score editor → fills the three
  number inputs and shows each rationale as helper text. User edits, then the
  normal save fires `updateItem`.
- **Acceptance:** on a seeded item, returns three integers in range with
  rationale; accepting them changes the card's computed rank; scores are only
  persisted on the user's save.

### 2. Problem-statement critique  ·  `POST /api/ai/critique`
- **Input:** `problemStatement` (+ `title` for context).
- **Output schema:** `{ score: int 1–5, questions: string[] (2–3), rewrite: string }`
  (`z.array(z.string()).min(2).max(3)`).
- **Prompt:** grade framing quality (who's the user, what's the pain, is it
  measurable), return the 2–3 sharpening questions and a tighter rewrite.
- **UI:** inline critique panel under the problem-statement field in
  `DetailModal` (and optionally `CaptureModal`); "Use rewrite" copies it into the
  field.
- **Acceptance:** returns a bounded score + exactly the sharpening questions;
  "Use rewrite" populates the field without saving.

### 3. Explain this ranking  ·  `POST /api/ai/explain-rank` (uses `generateText`)
- **Input:** the item's four scores, the global `Weights`, its `computeRank`
  value, and the 1–2 neighbors above/below it in the lane.
- **Output:** 2–3 sentences of plain prose — _why_ this item sits where it does.
- **Prompt:** the number is already computed server-side; the model only
  narrates the contribution of each weighted axis. No new math.
- **UI:** a popover on the rank badge ("Why here?").
- **Acceptance:** explanation references the dominant axis correctly for a known
  seeded example; no ranking value is recomputed by the model.

### 4. KR sharpener  ·  `POST /api/ai/kr`
- **Input:** the free-text goal / current `KeyResult.statement` + item context.
- **Output schema:** `KeyResult` shape — `{ statement, metric, unit, baseline, target, current }` (baseline/current may be null).
- **Prompt:** turn a vague goal into a measurable KR; propose metric, unit, and a
  defensible target, leave `current` null unless stated.
- **UI:** "✨ Make measurable" in the `DetailModal` KR editor → prefills the
  structured KR fields.
- **Acceptance:** returns a valid `KeyResult`; numeric fields typed correctly;
  prefill is editable and only saved on user action.

### 5. Idea intake copilot  ·  `POST /api/ai/capture`
- **Input:** raw pasted text (a Slack thread, a sentence, a ticket).
- **Output schema:** partial `Item` draft — `{ title, description, problemStatement, mission: enum(MISSIONS), kr?: KeyResult }`.
  `mission` is a **zod enum of `MISSIONS`** so the model can't invent a team.
- **Prompt:** extract a roadmap item; pick the best-fit mission from the provided
  list; draft a first KR if the text implies a metric.
- **UI:** a "Draft from text" textarea at the top of `CaptureModal` → prefills the
  form. On submit, `submitter` is stamped `{ type: "agent", name: "Intake" }`.
- **Acceptance:** produces a draft whose `mission` is always a valid `MISSIONS`
  member; the human reviews every field before the existing `createItem` runs.

### 6. Roadmap narrative / exec summary  ·  `POST /api/ai/summary` (uses `generateText`)
- **Input:** a **trimmed** `LoopState` — per item: `title`, `stage`, `horizon`,
  `mission`, KR reading, target dates. (Reuse the trimming spirit of
  `getPublicState` — no killed items, no activity log.)
- **Output:** markdown prose: what's shipping Now, what's Next, notable risks.
- **UI:** "Generate summary" in `ShareModal`, shown above the share link so
  stakeholders get prose alongside the read-only board. Stream the text
  (`streamText`) for responsiveness.
- **Acceptance:** summary only references non-killed items; regenerates on demand;
  never exposed as an _action_ on the anonymous share view (generation is
  authenticated; the resulting text can be shared).

---

## Sequencing

Foundation first, then features in leverage order. Features 1–4 are independent
once the foundation lands and can be parallelized; 5 and 6 reuse the same
helper.

```
Task 0  Foundation (model.ts, suggest.ts, route convention, useAiSuggestion,
        SuggestButton, aiEnabled gating, env + AGENTS.md)          ← blocks all
   │
   ├── Task 1  RICE suggester        (ship to prod first, gather feedback)
   ├── Task 2  KR sharpener
   ├── Task 3  Problem-statement critique
   ├── Task 4  Explain this ranking  (cheap rider — pairs with 1)
   ├── Task 5  Idea intake copilot
   └── Task 6  Exec summary / narrative
```

Rough effort (relative): Task 0 ≈ 1 day; Tasks 1–4 ≈ ½ day each; Tasks 5–6 ≈ ¾
day each. **Recommended first PR:** Foundation + RICE suggester + Explain-rank —
it proves the whole pattern end-to-end and delivers the highest-leverage feature.

---

## Testing & verification

- **Unit (pure functions):** prompt builders and zod schemas — assert a
  well-formed body validates and a malformed one rejects. No model call needed.
- **Route smoke tests:** mock `suggest`/`model` to return a canned object; assert
  401 when unauthenticated, 400 on bad input, 200 shape on success, 502 on a
  thrown model error.
- **Manual (`/verify` skill):** drive each feature in the running app —
  Suggest scores on a real card, draft an idea from pasted text, generate a
  summary — and confirm nothing persists until the user accepts.
- Every task ends with `npm run lint && npm run typecheck`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Model latency on interactive buttons | `"fast"` role model; `maxDuration = 30`; loading state on the button; stream the summary. |
| Cost creep | Small inputs; `fast` model for all but the summary; master `AI_FEATURES` flag to disable. |
| Bad suggestions eroding trust | Human-in-the-loop by design — nothing auto-saves; show rationale so users can judge. |
| Secrets exposure | Keys server-only; routes session-gated; no AI on the anonymous share view. |
| Provider lock-in | Role-based `model()` wrapper isolates the provider to one file. |

## Rollout

Ship behind `AI_FEATURES`. Land Foundation + RICE + Explain-rank first, enable
for the internal Campminder team, gather feedback for a week, then roll out the
remaining features. No schema migration is required for any Phase 1 feature.
