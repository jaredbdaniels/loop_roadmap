import Link from "next/link";
import {
  BET_GOAL_AREA_LABELS,
  BET_STATUS_LABELS,
  BET_THEME_LABELS,
  BET_TIER_LABELS,
  BET_VALUE_BASIS_LABELS,
  BET_VALUE_TYPE_LABELS,
  BET_VERDICT_LABELS,
  HORIZONS,
  PLANNED_HORIZONS,
  STAGES,
} from "@/lib/loop/constants";
import {
  betEnabledItems,
  betEnvelope,
  betFundedItems,
  betFundedShare,
  betJtbdScope,
  betProgress,
  betReach,
  betTeamShares,
  betTeams,
  betTypeMix,
  fmtRange,
  isIntake,
  runTheBusinessShare,
  sharedPlatformItems,
  toISODate,
} from "@/lib/loop/logic";
import { getJtbd } from "@/lib/loop/taxonomy";
import type { Bet, Item, KeyResult } from "@/lib/loop/types";

// The read surface for a bet — see docs/bet-detail.md.
//
// Deliberately a plain server component: no store, no state, no mutations. Every
// number on the page comes from the derivations in logic.ts, which were written
// for exactly this and until now were wired to nothing. That constraint is what
// lets the same component render for a signed-in reader, a share-link reader and
// (later) the narrative view without three versions of the truth.
//
// The governing rule from the spec, which every block below obeys:
//
//   A narrative is a rendering of the schema, not a field in it.
//
// Nothing here is stored prose. Where a declared field is empty the sentence
// still runs and the gap shows as a blank — an empty thesis reads as a hole in a
// claim rather than as a textarea somebody will get to later.

export function BetDetail({
  bet,
  bets,
  items,
  editHref,
  backHref = "/",
}: {
  bet: Bet;
  bets: Bet[];
  items: Item[];
  // Where a blank or the Edit button sends you. Null in read-only contexts,
  // where the gaps are still worth showing but nobody can fill them.
  editHref: string | null;
  backHref?: string;
}) {
  // Two item lists, and mixing them up is the way this page tells lies.
  //
  //   `items`   — the whole roadmap. Required by the share helpers, whose
  //               denominator is deliberately every scheduled epic-quarter,
  //               bet-funded or not (see logic.ts). Filtering it would invert
  //               the headline number.
  //   `costed`  — what this bet actually spends: alive, and out of Intake. The
  //               same rule `costedItems()` applies inside those helpers, so
  //               anything this page counts itself has to apply it too or the
  //               lede and the lists below it will disagree.
  const costed = items.filter((i) => !i.killed && !isIntake(i));
  // Killed work is dropped everywhere on this page. It is not "parked" — it is
  // over — and leaving it in the lists would show a dead epic with no marking.
  const live = items.filter((i) => !i.killed);

  const funded = betFundedShare(bet, items);
  const reach = betReach(bet, items);
  const rtb = runTheBusinessShare(items);
  // Teams, dates and type mix describe the spend, so they read the costed list.
  // Derived from every linked item they would be driven by work this same page
  // labels "counted nowhere above" — a bet whose epics are all parked would
  // claim five teams and a date range while funding 0%.
  const teams = betTeams(bet, costed);
  const teamShares = betTeamShares(bet, items);
  const env = betEnvelope(bet, costed);
  const scope = betJtbdScope(bet, live);
  const progress = betProgress(bet, costed);
  const mix = betTypeMix(bet, costed);
  const shared = sharedPlatformItems(items).filter((i) =>
    (i.betIds || []).includes(bet.id),
  );

  const fundedItems = betFundedItems(bet, live);
  const enabledItems = betEnabledItems(bet, live);
  // Parked work is shown but never counted — see D2 in docs/narrative-decisions.md.
  // The split is what keeps an internal reader and a share reader from
  // disagreeing about the same bet's epic count.
  const parked = [...fundedItems, ...enabledItems].filter(isIntake);
  const costedFunded = fundedItems.filter((i) => !isIntake(i));
  const costedEnabled = enabledItems.filter((i) => !isIntake(i));

  return (
    <article className="bet-detail">
      <header className="bet-detail-head">
        <Link className="bet-detail-back" href={backHref}>
          ← Roadmap
        </Link>
        <div
          className="bet-detail-title"
          style={{ ["--bet-color" as string]: bet.color }}
        >
          <span className="bet-detail-dot" aria-hidden />
          <h1>{bet.title}</h1>
        </div>
        <p className="bet-detail-chips">
          <span>{BET_TIER_LABELS[bet.tier]}</span>
          <span>{BET_THEME_LABELS[bet.theme]}</span>
          <span>{BET_GOAL_AREA_LABELS[bet.goalArea]}</span>
          <span>{BET_STATUS_LABELS[bet.status]}</span>
          {bet.horizon && (
            <span>{HORIZONS.find((h) => h.key === bet.horizon)?.label}</span>
          )}
          {bet.owner && <span>{bet.owner}</span>}
        </p>
        {editHref && (
          <Link className="cm-button bet-detail-edit" href={editHref}>
            Edit bet
          </Link>
        )}
      </header>

      {/* ---------- the lede ---------- */}
      {/* One composed paragraph, in the grammar docs/bet-detail.md specifies.
          Clauses are never suppressed when their field is empty: a bet with no
          kill criteria should read as a bet that cannot end, not as a shorter,
          tidier paragraph. */}
      <p className="bet-lede">
        We believe <Field v={bet.thesis} name="thesis" href={editHref} />
        {" "}
        <Field v={bet.whyNow} name="why now" href={editHref} />
        {" "}
        We intend{" "}
        {bet.tier === "foundational" ? (
          <PlannedClause bet={bet} />
        ) : (
          <span className="bet-lede-note">
            no share — this is an experiment, not a foundational bet
          </span>
        )}
        ; today it funds <strong>{funded.share}%</strong> of the roadmap —{" "}
        {funded.epics} epic{funded.epics === 1 ? "" : "s"}, {funded.quarters}{" "}
        epic-quarter{funded.quarters === 1 ? "" : "s"} — across {teams.length}{" "}
        team{teams.length === 1 ? "" : "s"}, running{" "}
        {env ? (
          fmtRange({
            targetStart: toISODate(env.start),
            targetEnd: toISODate(env.end),
          })
        ) : (
          <span className="bet-blank">not scheduled yet</span>
        )}
        . It&rsquo;s worth <Money bet={bet} href={editHref} />. We&rsquo;ll stop
        if <Field v={bet.killCriteria} name="kill criteria" href={editHref} />{" "}
        We re-decide on{" "}
        <Field v={bet.nextReview ?? ""} name="review date" href={editHref} />
      </p>

      {reach.quarters > funded.quarters && (
        <p className="helper">
          Funds {funded.share}% · reaches work totalling {reach.share}% (
          {reach.epics} epics) once the work other bets pay for is counted.
        </p>
      )}

      {/* ---------- delta 1: planned against funded ---------- */}
      <section className="bet-block">
        <h2>Planned against funded</h2>
        {bet.tier === "foundational" ? (
          <div className="bet-bars">
            {PLANNED_HORIZONS.map((h) => {
              const planned = bet.plannedShare?.[h] ?? 0;
              const gap = +(planned - funded.share).toFixed(1);
              return (
                <div className="bet-bar-row" key={h}>
                  <span className="bet-bar-label">
                    {HORIZONS.find((x) => x.key === h)?.label ?? h}
                  </span>
                  {/* Funded is the fill; planned is a marker sitting on top of
                      it, not a second fill. Two overlaid fills hide whichever
                      is shorter, which loses the overspend case exactly when it
                      matters most — a marker reads in both directions. */}
                  <div className="bet-bar-track" aria-hidden>
                    <span
                      className="bet-bar-funded"
                      style={{
                        width: `${Math.min(100, funded.share)}%`,
                        ["--bet-color" as string]: bet.color,
                      }}
                    />
                    {planned > 0 && (
                      <span
                        className="bet-bar-planned"
                        style={{ left: `${Math.min(100, planned)}%` }}
                      />
                    )}
                  </div>
                  <span className="bet-bar-read">
                    {planned === 0 ? (
                      <span className="bet-blank">no share declared</span>
                    ) : (
                      <>
                        intended {planned}%, funding {funded.share}% —{" "}
                        {gap === 0
                          ? "no gap"
                          : `a ${Math.abs(gap)}-point ${gap > 0 ? "shortfall" : "overspend"}`}
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="helper">
            Experiments carry a review date and a size, not a share of capacity.
          </p>
        )}
        <p className="helper">
          Run-the-business — work no bet funds — is {rtb.share}% of the roadmap
          ({rtb.epics} epics).
        </p>
      </section>

      {/* ---------- delta 2: declared scope against actual ---------- */}
      <section className="bet-block">
        <h2>Where we said we&rsquo;d bet, and where the work landed</h2>
        {scope.length === 0 ? (
          <p className="bet-blank">
            No jobs-to-be-done declared, and no linked work to infer them from.
          </p>
        ) : (
          <ul className="bet-scope">
            {scope.map((s) => {
              const label = getJtbd(s.jtbdId)?.label ?? s.jtbdId;
              const counted = s.items.filter((i) => !isIntake(i));
              return (
                <li key={s.jtbdId} className={s.declared ? "" : "undeclared"}>
                  <span className="bet-scope-name">{label}</span>
                  <span className="bet-scope-meta">
                    {s.declared ? "declared" : "not declared"} ·{" "}
                    {counted.length} epic{counted.length === 1 ? "" : "s"}
                    {s.items.length > counted.length &&
                      ` (+${s.items.length - counted.length} parked)`}
                  </span>
                  {s.declared && counted.length === 0 && (
                    <span className="bet-finding">
                      Claimed, and nothing staffed here.
                    </span>
                  )}
                  {!s.declared && (
                    <span className="bet-finding">
                      {counted.length} epic{counted.length === 1 ? "" : "s"} this
                      bet never declared.
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- delta 3: the KPI against its own baseline ---------- */}
      <section className="bet-block">
        <h2>The measure</h2>
        {bet.value.statement && <p>{bet.value.statement}</p>}
        {bet.outcomes.length === 0 ? (
          <p className="bet-blank">
            No KPI on this bet, so there is nothing to judge it against later.
          </p>
        ) : (
          <ul className="bet-kpis">
            {bet.outcomes.map((o, n) => (
              <li key={n}>
                <Kpi kr={o} />
              </li>
            ))}
          </ul>
        )}
        <p className="helper">
          Confidence {bet.confidence}/5 · reversibility {bet.reversibility}/5 ·
          evidence {bet.evidence.strength}/5
          {bet.evidence.notes ? ` — ${bet.evidence.notes}` : ""}
        </p>
        {(() => {
          // Epic-KR coverage is hygiene, not the bet's measure: an epic KR asks
          // whether one piece of work moved its own metric, and a dozen of those
          // do not sum to a portfolio number. See docs/strategic-bets.md.
          const withKr = costedFunded.filter((i) => i.kr?.target != null).length;
          return costedFunded.length ? (
            <p className="helper">
              {withKr} of {costedFunded.length} funded epics carry a target of
              their own.
            </p>
          ) : null;
        })()}
      </section>

      {/* ---------- the investment ---------- */}
      <section className="bet-block">
        <h2>What it costs, and who pays it</h2>
        {teamShares.length === 0 ? (
          <p className="bet-blank">No scheduled work funded by this bet yet.</p>
        ) : (
          <ul className="bet-teams">
            {teamShares.map((t) => (
              <li key={t.team}>
                <span className="bet-scope-name">{t.team}</span>
                <span className="bet-scope-meta">
                  {t.quarters} epic-quarter{t.quarters === 1 ? "" : "s"} —{" "}
                  {t.share}% of everything that team has scheduled
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="helper">
          Type mix: {mix.modernize} modernize · {mix["new-value"]} new value ·{" "}
          {mix.both} both
          {mix.unclassified ? ` · ${mix.unclassified} unclassified` : ""}
          {mix.modernize > 0 &&
            mix["new-value"] === 0 &&
            mix.both === 0 &&
            " — every funded epic is modernization, so this is a modernization programme."}
        </p>
        {shared.length > 0 && (
          <p className="bet-finding">
            {shared.length} epic{shared.length === 1 ? "" : "s"} here{" "}
            {shared.length === 1 ? "is" : "are"} shared platform work that three
            or more bets rest on:{" "}
            {shared.map((i) => i.title).join(", ")}.
          </p>
        )}
      </section>

      {/* ---------- the work ---------- */}
      <section className="bet-block">
        <h2>The work</h2>
        {progress && (
          <p className="helper">
            {progress.done} of {progress.total} linked epics have reached
            customers ·{" "}
            {STAGES.map((s) => {
              const n = [...costedFunded, ...costedEnabled].filter(
                (i) => i.stage === s,
              ).length;
              return n ? `${n} ${s}` : null;
            })
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <EpicList title="Funded by this bet" items={costedFunded} />
        <EpicList
          title="Enabled by, paid for elsewhere"
          items={costedEnabled}
          funders={bets}
        />
        {parked.length > 0 && (
          <EpicList
            title="Parked in Intake — costs nothing, counted nowhere above"
            items={parked}
            muted
          />
        )}
        {costedFunded.length === 0 &&
          costedEnabled.length === 0 &&
          parked.length === 0 && (
            <p className="bet-blank">
              No epics linked, so this bet claims ground it has staffed nothing
              on.
            </p>
          )}
      </section>

      {/* ---------- the decision ---------- */}
      <section className="bet-block">
        <h2>The decision</h2>
        {bet.decision.verdict ? (
          <>
            <p>
              <strong>{BET_VERDICT_LABELS[bet.decision.verdict]}</strong>
              {bet.decision.decidedAt
                ? ` — decided ${bet.decision.decidedAt.slice(0, 10)}`
                : ""}
            </p>
            {bet.decision.rationale && <p>{bet.decision.rationale}</p>}
          </>
        ) : (
          <p className="helper">Still running.</p>
        )}
        <Learnings items={[...costedFunded, ...costedEnabled]} />
      </section>

      {/* ---------- activity ---------- */}
      <section className="bet-block">
        <h2>What happened</h2>
        {bet.activity?.length ? (
          <ol className="bet-activity">
            {bet.activity.map((a, n) => (
              <li key={n}>{a}</li>
            ))}
          </ol>
        ) : (
          <p className="bet-blank">
            Nothing logged yet. Entries appear as the bet is committed, funded,
            reviewed and decided.
          </p>
        )}
      </section>
    </article>
  );
}

/* ---------------- lede primitives ---------------- */

// A declared field inside the lede. Present, it reads as prose; absent, it reads
// as a hole in a sentence and links straight to the field that fills it. That
// asymmetry is the whole point — see docs/bet-detail.md.
function Field({
  v,
  name,
  href,
}: {
  v: string;
  name: string;
  href: string | null;
}) {
  const text = v?.trim();
  if (text) return <>{text.endsWith(".") ? text : `${text}.`}</>;
  const blank = (
    <span className="bet-blank" title={`No ${name} recorded`}>
      ——— <span className="bet-blank-name">{name}</span>
    </span>
  );
  return href ? <Link href={href}>{blank}</Link> : blank;
}

function PlannedClause({ bet }: { bet: Bet }) {
  const declared = PLANNED_HORIZONS.filter((h) => (bet.plannedShare?.[h] ?? 0) > 0);
  if (declared.length === 0)
    return <span className="bet-blank">no share of capacity declared</span>;
  return (
    <>
      {declared
        .map(
          (h) =>
            `${bet.plannedShare[h]}% of ${
              HORIZONS.find((x) => x.key === h)?.label ?? h
            }`,
        )
        .join(", ")}
    </>
  );
}

function Money({ bet, href }: { bet: Bet; href: string | null }) {
  const { magnitude, type, basis, timeToValue } = bet.value;
  if (magnitude == null) {
    const blank = (
      <span className="bet-blank">
        ——— <span className="bet-blank-name">value</span>
      </span>
    );
    return href ? <Link href={href}>{blank}</Link> : blank;
  }
  const money =
    magnitude >= 1_000_000
      ? `$${(magnitude / 1_000_000).toFixed(1)}M`
      : magnitude >= 1_000
        ? `$${Math.round(magnitude / 1_000)}k`
        : `$${magnitude}`;
  return (
    <>
      <strong>{money}</strong> in {BET_VALUE_TYPE_LABELS[type].toLowerCase()} (
      {BET_VALUE_BASIS_LABELS[basis].toLowerCase()})
      {timeToValue != null
        ? `, landing in about ${timeToValue} quarter${timeToValue === 1 ? "" : "s"}`
        : ""}
    </>
  );
}

function Kpi({ kr }: { kr: KeyResult }) {
  const unit = kr.unit ? ` ${kr.unit}` : "";
  if (kr.baseline == null && kr.target == null)
    return (
      <>
        <span className="bet-scope-name">{kr.statement || kr.metric}</span>{" "}
        <span className="bet-blank">
          no baseline or target, so it cannot show movement
        </span>
      </>
    );
  return (
    <>
      <span className="bet-scope-name">{kr.statement || kr.metric}</span>{" "}
      <span className="bet-scope-meta">
        {kr.baseline ?? "—"} → {kr.target ?? "—"}
        {unit}
        {kr.current != null ? ` (now ${kr.current}${unit})` : " (no reading yet)"}
      </span>
    </>
  );
}

/* ---------------- lists ---------------- */

function EpicList({
  title,
  items,
  funders,
  muted,
}: {
  title: string;
  items: Item[];
  funders?: Bet[];
  muted?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className={"bet-epics" + (muted ? " muted" : "")}>
      <h3>
        {title} <span className="bet-epics-count">{items.length}</span>
      </h3>
      <ul>
        {items.map((i) => {
          const funder = funders?.find((b) => b.id === i.fundedBetId);
          return (
            <li key={i.id}>
              <span className="bet-scope-name">{i.title}</span>
              <span className="bet-scope-meta">
                {i.mission || "No team"} · {i.stage}
                {i.owner ? ` · ${i.owner}` : ""}
                {funder ? ` · funded by ${funder.title}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Retrospective notes already carried on the epics. Rolled up here rather than
// restated on the bet: the bet's own verdict is above, and this is the evidence
// underneath it.
function Learnings({ items }: { items: Item[] }) {
  const notes = items.filter(
    (i) => i.whatWeLearned || i.whatWeDoDifferently || i.nextBet,
  );
  if (!notes.length) return null;
  return (
    <div className="bet-learnings">
      <h3>What the work taught us</h3>
      <ul>
        {notes.map((i) => (
          <li key={i.id}>
            <span className="bet-scope-name">{i.title}</span>
            {i.whatWeLearned && <p>{i.whatWeLearned}</p>}
            {i.whatWeDoDifferently && <p>{i.whatWeDoDifferently}</p>}
            {i.nextBet && <p>{i.nextBet}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
