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
}: {
  params: Promise<{ token: string }>;
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
      shareToken={token}
    />
  );
}
