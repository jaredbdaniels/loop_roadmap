import { redirect } from "next/navigation";
import { getSession } from "@/lib/require-session";
import { getState } from "@/lib/loop/store";
import { LoopApp } from "@/components/loop/LoopApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { items, weights, bets, milestones } = await getState();

  return (
    <LoopApp
      initialItems={items}
      initialWeights={weights}
      initialBets={bets}
      initialMilestones={milestones}
      userEmail={session.user.email}
    />
  );
}
