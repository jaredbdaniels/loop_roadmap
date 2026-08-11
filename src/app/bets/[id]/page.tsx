import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/require-session";
import { getState } from "@/lib/loop/store";
import { BetDetail } from "@/components/loop/BetDetail";

export const dynamic = "force-dynamic";

// A bet's own page. A route rather than a modal (D1 in
// docs/narrative-decisions.md) because three things want to link to a single bet
// — the narrative view, Slack, and the timeline band — and retrofitting
// linkability onto a modal means touching every call site twice.
//
// Editing stays in BetModal, reached via /?edit=<id>. There is deliberately no
// second edit path: if this page grew an inline editor, the two would drift.
export default async function BetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const { items, bets } = await getState();
  const bet = bets.find((b) => b.id === id);
  if (!bet) notFound();

  return (
    <main className="bet-page">
      <BetDetail
        bet={bet}
        bets={bets}
        items={items}
        editHref={`/?edit=${bet.id}`}
      />
    </main>
  );
}
