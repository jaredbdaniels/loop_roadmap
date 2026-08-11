import { redirect } from "next/navigation";
import { getSession } from "@/lib/require-session";
import {
  SEED_WEIGHTS,
  seedBets,
  seedItems,
  seedMilestones,
} from "@/lib/loop/seed";
import { LoopApp } from "@/components/loop/LoopApp";

export const dynamic = "force-dynamic";

// Read-only preview of the committed seed roadmap (the two-year owner-grouped
// plan of record), rendered straight from seed-data.json — it never reads or
// writes the shared database, so it always reflects the checked-in seed
// regardless of what's in the live DB. Login-gated like the main app; renders
// the same app in read-only mode, opened on the owner-grouped Timeline
// (Timeline + Domain grouping) so it lands on the owner view by default.
export default async function PreviewPage({
  searchParams,
}: {
  // Same view-state params as the main app; the defaults below are what a bare
  // /preview opens on. See view-state.ts.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <LoopApp
      initialItems={seedItems()}
      initialWeights={SEED_WEIGHTS}
      initialBets={seedBets()}
      initialMilestones={seedMilestones()}
      userEmail={session.user.email}
      readOnly
      viewDefaults={{ view: "timeline", groupBy: "domain" }}
      viewParams={await searchParams}
    />
  );
}
