import { redirect } from "next/navigation";
import { getSession } from "@/lib/require-session";
import { getState } from "@/lib/loop/store";
import { LoopApp } from "@/components/loop/LoopApp";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  // Two kinds of param arrive here, and they behave differently:
  //
  //   `?edit=<id>` (with an optional `&field=`) is a one-shot instruction —
  //   open the bet editor on arrival, which is how a bet page's Edit button
  //   gets you back here without that page needing an editor of its own. It's
  //   cleared from the URL once carried out.
  //
  //   everything else (`view`, `zoom`, `group`, `teams`, `owner`, `bet`,
  //   `killed`, `item`) is view state, parsed in view-state.ts. It's read here
  //   rather than on the client so a reload renders the view you were on
  //   server-side, instead of flashing the Board first.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { items, weights, bets, milestones, outlooks } = await getState();
  const params = await searchParams;
  const edit = typeof params.edit === "string" ? params.edit : undefined;
  const field = typeof params.field === "string" ? params.field : undefined;

  return (
    <LoopApp
      initialItems={items}
      initialWeights={weights}
      initialBets={bets}
      initialMilestones={milestones}
      initialOutlooks={outlooks}
      userEmail={session.user.email}
      viewParams={params}
      openBetOnMount={edit && bets.some((b) => b.id === edit) ? edit : undefined}
      focusBetField={field}
    />
  );
}
