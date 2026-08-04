#!/usr/bin/env python3
"""Build the Notion brief backfill map for review.

Every roadmap item carries `notionUrl` / `notionTitle` (types.ts), and the app
now renders a link out to the brief from every card and bar. But all 124 seeded
items ship those fields empty, so the link is inert until they're filled in.

Notion has no product-brief database to join against. Briefs are ordinary pages
named "Launch Control: <feature>", "Positioning Brief — <feature>", or
"Mini Launch: <feature>", living under the Projects / CampCo Initiatives
databases. So matching is a judgment call, not a lookup — which is why this
script writes a CSV for a human to review rather than editing the seed.

MATCHES below is hand-curated: each entry is a real Notion page found by
searching the workspace for those three title patterns, paired with the item it
appears to describe, plus a confidence and the reasoning. Process docs and
templates ("Tier 1 — Launch Control: For Major Releases", "Positioning Brief
Template", "Launch Control Working Doc", ...) are deliberately excluded — they
describe the process, not a piece of work on the roadmap.

Usage:
    python3 build_notion_map.py          # writes notion-brief-map.csv

Then: review the CSV, correct or clear rows, and only afterwards teach
build_import.py to read it. Nothing here writes to seed-data.json.
"""

import csv
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SEED = HERE.parent.parent / "src" / "lib" / "loop" / "seed-data.json"
OUT = HERE / "notion-brief-map.csv"

# item_id -> (notion_title, notion_url, confidence, notes)
#
# confidence:
#   high    the page names this exact piece of work; safe to accept as-is
#   medium  clearly the same feature area, but the page's scope and the item's
#           scope aren't identical — worth a look before accepting
#   low     a plausible area match only; expect to correct or clear this
MATCHES = {
    "ep-applications-registration-01": (
        "Launch Control: Registration",
        "https://app.notion.com/p/37cd23fa124b80d6b757e0017ee7ffd2",
        "high",
        "The live LC for the registration program; this item is the MVP-to-GA umbrella.",
    ),
    "ep-applications-registration-03": (
        "Positioning Brief — Full Registration Launch (Tier 1)",
        "https://app.notion.com/p/39ed23fa124b81d0b3f2fc976079523d",
        "medium",
        "Tier 1 positioning covers the full public launch, which is this GA item "
        "rather than the umbrella. Could reasonably hang off -01 instead.",
    ),
    "ep-family-communication-01": (
        "Launch Control: Ask Camp",
        "https://app.notion.com/p/345d23fa124b80fa8bfac8b3b9239b72",
        "medium",
        "AMBIGUOUS — SEE NOTE. The LC describes the parent-facing grounded-answer "
        "chat in Campanion (PM Anna), which matches this item's description "
        "exactly. But ep-productized-ai-01 'AskCamp' is the same product seen "
        "from the AI-platform side, and -02/-03 continue it. One Notion brief, "
        "four roadmap items: decide which one owns the link.",
    ),
    "ep-recruiting-hiring-01": (
        "Launch Control: Staff Hiring",
        "https://app.notion.com/p/295d23fa124b80cfa9cfdc1ba591d71c",
        "medium",
        "Staff hiring LC vs. this item's ATS pipeline automations — same area, and "
        "the item is the only hiring-pipeline work on the roadmap. A GTM "
        "positioning doc also exists: /p/388d23fa124b81c390f5e0aa1eab0237",
    ),
    "ep-reporting-platform-01": (
        "Launch Control: Reporting — Enrollment Dashboard MVP",
        "https://app.notion.com/p/3abd23fa124b818c9664e7234d6a70f4",
        "medium",
        "The LC says 'MVP', which matches this Databricks MVP item. But "
        "ep-reporting-platform-03 is literally 'Enrollment dashboard + scheduled "
        "reports' — check which the LC is actually tracking.",
    ),
    "ep-medical-operations-01": (
        "Mini Launch: Medical Log & Treatment Attachments",
        "https://app.notion.com/p/3abd23fa124b812a9f3ff380ac99216e",
        "medium",
        "A Tier 2 mini launch for one slice of the health-center work; this item is "
        "the whole modernization. Narrower than the item it's attached to.",
    ),
    "ep-media-01": (
        "Launch Control: Photo Season Passes FY26 - BETA",
        "https://app.notion.com/p/26ad23fa124b80e5930af543fe55213c",
        "medium",
        "Season Passes is the pricing/packaging launch on top of photos, not the "
        "photo modernization itself. Positioning inputs: "
        "/p/328d23fa124b8074909fcdc642e92ae5",
    ),
    "ep-marketing-recruitment-01": (
        "Positioning Brief — Interest Form (Tier 2)",
        "https://app.notion.com/p/39ed23fa124b81aba295e44f421b5685",
        "low",
        "'Interest Form' reads as inquiry capture, which is this item's area, but "
        "the brief may well belong to the registration program instead.",
    ),
    "ep-community-engagement-02": (
        "Launch Control for Staff Access in Campanion",
        "https://app.notion.com/p/1c2d23fa124b803bb73fd1978559c6d0",
        "low",
        "From April 2025 and probably stale. Staff access in Campanion touches this "
        "merge work, but could equally be permissions or the staff domain. Expect "
        "to clear this one.",
    ),
}


def main() -> int:
    items = json.loads(SEED.read_text())["items"]
    rows = []
    for item in items:
        title, url, confidence, notes = MATCHES.get(
            item["id"], ("", "", "", "")
        )
        rows.append(
            {
                "item_id": item["id"],
                "item_title": item["title"],
                "mission": item["mission"],
                "notion_title": title,
                "notion_url": url,
                "confidence": confidence,
                "notes": notes,
            }
        )

    # Matched rows first so the part needing review is at the top of the file;
    # the unmatched tail is the brief-coverage worklist and is kept, not dropped,
    # so the gap stays visible instead of looking like full coverage.
    rows.sort(key=lambda r: (not r["notion_url"], r["item_id"]))

    with OUT.open("w", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "item_id",
                "item_title",
                "mission",
                "notion_title",
                "notion_url",
                "confidence",
                "notes",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    matched = sum(1 for r in rows if r["notion_url"])
    by_conf = {c: sum(1 for r in rows if r["confidence"] == c) for c in ("high", "medium", "low")}
    print(f"wrote {OUT.relative_to(HERE.parent.parent)}")
    print(f"  {len(rows)} items, {matched} matched, {len(rows) - matched} with no brief found")
    print(f"  confidence: high={by_conf['high']} medium={by_conf['medium']} low={by_conf['low']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
