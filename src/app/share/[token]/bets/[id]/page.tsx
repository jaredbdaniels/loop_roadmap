import { notFound } from "next/navigation";
import { getPublicState } from "@/lib/loop/store";
import { validateShareToken } from "@/lib/loop/share";
import { BetDetail } from "@/components/loop/BetDetail";

export const dynamic = "force-dynamic";

// The public, anonymous read of a single bet. Same token gate as the share
// roadmap: the token is the only credential, and an invalid, revoked or expired
// one 404s uniformly, leaking nothing about whether it ever existed.
//
// This is the gap the read surface exists to close. Until now a share-link
// reader could see a bet as a colored band on the timeline and nothing else —
// no thesis, no cost, no reasoning. `getPublicState` already strips killed and
// parked work, so the epic counts here match what the same reader sees
// everywhere else.
//
// `editHref` is null: the gaps are still worth showing to an outside reader —
// a bet with no kill criteria is a fact about the bet — but nobody out here can
// fill them.
export default async function ShareBetPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  if (!(await validateShareToken(token))) notFound();

  const { items, bets } = await getPublicState();
  const bet = bets.find((b) => b.id === id);
  if (!bet) notFound();

  return (
    <main className="bet-page">
      <BetDetail
        bet={bet}
        bets={bets}
        items={items}
        editHref={null}
        backHref={`/share/${token}`}
      />
    </main>
  );
}
