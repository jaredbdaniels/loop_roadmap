import { notFound } from "next/navigation";
import { getPublicState } from "@/lib/loop/store";
import { validateShareToken } from "@/lib/loop/share";
import { LoopApp } from "@/components/loop/LoopApp";

export const dynamic = "force-dynamic";

// Public, anonymous, read-only view of the roadmap. Intentionally never calls
// getSession() — the token is the only credential. An invalid/revoked/expired
// token 404s uniformly, leaking nothing about whether it ever existed.
export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  // View state (view / zoom / grouping / filters), so a reader who reloads —
  // or who was sent a link to one particular slice — lands where they expect.
  // See view-state.ts.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  if (!(await validateShareToken(token))) notFound();

  const { items, weights, bets, milestones } = await getPublicState();

  return (
    <LoopApp
      initialItems={items}
      initialWeights={weights}
      initialBets={bets}
      initialMilestones={milestones}
      userEmail={null}
      readOnly
      viewParams={await searchParams}
      shareToken={token}
    />
  );
}
