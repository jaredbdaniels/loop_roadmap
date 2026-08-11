import { redirect } from "next/navigation";
import { getSession } from "@/lib/require-session";
import { getState } from "@/lib/loop/store";
import { LoopApp } from "@/components/loop/LoopApp";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  // `?bet=<id>` opens the bet editor on arrival — how a bet page's Edit button
  // gets you back here without the page needing an editor of its own.
  searchParams: Promise<{ bet?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { items, weights, bets, milestones } = await getState();
  const { bet } = await searchParams;

  return (
    <LoopApp
      initialItems={items}
      initialWeights={weights}
      initialBets={bets}
      initialMilestones={milestones}
      userEmail={session.user.email}
      openBetOnMount={bet && bets.some((b) => b.id === bet) ? bet : undefined}
    />
  );
}
