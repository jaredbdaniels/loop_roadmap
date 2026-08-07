import type { Item } from "@/lib/loop/types";
import { parseWorkItemId, type AdoWorkItem } from "./client";

// Pure, testable core of the ADO → Loop sync. No I/O here: the route fetches
// the work items and persists results; this module only decides what changes.
//
// Direction is one-way (ADO → Loop). We update `adoStatus` only; we never write
// to ADO and never auto-advance a Loop stage — stage disagreements are surfaced
// as advisory flags for a human to act on, per the integration plan.

export interface AdoDiff {
  id: string;
  title: string;
  from: string;
  to: string;
}

export interface AdoFlag {
  id: string;
  title: string;
  note: string;
}

export interface AdoSyncSummary {
  checked: number; // items + sub-items that carry an adoUrl
  updated: AdoDiff[]; // status changes (items and sub-items alike)
  unchanged: number;
  notFound: AdoFlag[]; // adoUrl present but no matching/visible work item
  malformed: AdoFlag[]; // adoUrl present but no id could be parsed
  flags: AdoFlag[]; // ADO state disagrees with Loop stage
  completed: AdoFlag[]; // sub-items auto-completed because their work item closed
}

// "Active — FY24.Q4" | "Closed" (no iteration) | "New"
export function formatAdoStatus(wi: AdoWorkItem): string {
  return wi.iteration ? `${wi.state} — ${wi.iteration}` : wi.state;
}

// ADO states that read as "work is done".
const CLOSED_STATES = new Set(["Closed", "Done", "Completed", "Resolved"]);
// ADO states that read as "work is in flight".
const ACTIVE_STATES = new Set(["Active", "Committed", "In Progress", "Doing"]);

// A work item in a closed state means the piece of work it tracks is finished.
export function isClosedState(state: string): boolean {
  return CLOSED_STATES.has(state);
}

function stageFlag(item: Item, wi: AdoWorkItem): string | null {
  if (CLOSED_STATES.has(wi.state) && item.stage !== "Releasing") {
    return `ADO work item is ${wi.state} but the Loop item is still in ${item.stage} — consider setting a shipped date and moving toward Releasing.`;
  }
  if (ACTIVE_STATES.has(wi.state) && item.stage !== "Building") {
    return `ADO work item is ${wi.state} but the Loop item is in ${item.stage} rather than Building.`;
  }
  return null;
}

export function computeAdoSync(
  items: Item[],
  fetched: Map<number, AdoWorkItem>,
  nowISO: string,
): { updatedItems: Item[]; summary: AdoSyncSummary } {
  const summary: AdoSyncSummary = {
    checked: 0,
    updated: [],
    unchanged: 0,
    notFound: [],
    malformed: [],
    flags: [],
    completed: [],
  };
  const updatedItems: Item[] = [];

  for (const item of items) {
    // Collect activity lines and only touch the item once, so a change to the
    // item's own link and to its sub-items' links produce a single write.
    const activityAdds: string[] = [];
    let next: Item = item;

    // --- item-level link (unchanged behavior) ---
    const url = (item.adoUrl || "").trim();
    if (url) {
      summary.checked++;
      const id = parseWorkItemId(url);
      if (id === null) {
        summary.malformed.push({
          id: item.id,
          title: item.title,
          note: `Could not read a work-item id from "${url}".`,
        });
      } else {
        const wi = fetched.get(id);
        if (!wi) {
          summary.notFound.push({
            id: item.id,
            title: item.title,
            note: `Work item ${id} was not found or is not visible to the sync token.`,
          });
        } else {
          const flagNote = stageFlag(item, wi);
          if (flagNote)
            summary.flags.push({ id: item.id, title: item.title, note: flagNote });

          const status = formatAdoStatus(wi);
          if (status === item.adoStatus) {
            summary.unchanged++;
          } else {
            summary.updated.push({
              id: item.id,
              title: item.title,
              from: item.adoStatus || "(empty)",
              to: status,
            });
            activityAdds.push(
              `ADO status synced: ${item.adoStatus || "(empty)"} → ${status}.`,
            );
            next = { ...next, adoStatus: status };
          }
        }
      }
    }

    // --- sub-item links (the breakdown that rolls up into the parent) ---
    let subsChanged = false;
    const nextSubs = (item.subItems || []).map((sub) => {
      const surl = (sub.adoUrl || "").trim();
      if (!surl) return sub;
      summary.checked++;
      // Label sub-items with their parent so flags/diffs read unambiguously.
      const label = `${item.title} ▸ ${sub.title}`;

      const sid = parseWorkItemId(surl);
      if (sid === null) {
        summary.malformed.push({
          id: sub.id,
          title: label,
          note: `Could not read a work-item id from "${surl}".`,
        });
        return sub;
      }

      const wi = fetched.get(sid);
      if (!wi) {
        summary.notFound.push({
          id: sub.id,
          title: label,
          note: `Work item ${sid} was not found or is not visible to the sync token.`,
        });
        return sub;
      }

      const status = formatAdoStatus(wi);
      // A closed work item completes the sub-item. We only ever check the box
      // from ADO — never uncheck it — so a manual completion is never undone.
      const done = isClosedState(wi.state) ? true : sub.done;
      const statusChanged = status !== (sub.adoStatus || "");
      const doneChanged = done !== sub.done;

      if (!statusChanged && !doneChanged) {
        summary.unchanged++;
        return sub;
      }

      if (statusChanged) {
        summary.updated.push({
          id: sub.id,
          title: label,
          from: sub.adoStatus || "(empty)",
          to: status,
        });
      }
      if (doneChanged) {
        summary.completed.push({
          id: sub.id,
          title: label,
          note: `Work item ${sid} is ${wi.state}.`,
        });
        activityAdds.push(
          `Sub-item "${sub.title}" completed — ADO work item ${sid} is ${wi.state}.`,
        );
      } else if (statusChanged) {
        activityAdds.push(
          `Sub-item "${sub.title}" ADO status synced: ${sub.adoStatus || "(empty)"} → ${status}.`,
        );
      }

      subsChanged = true;
      return { ...sub, adoStatus: status, done };
    });

    if (subsChanged) next = { ...next, subItems: nextSubs };

    // Persist only when something actually moved.
    if (next !== item) {
      updatedItems.push({
        ...next,
        updatedAt: nowISO,
        activity: [...(item.activity || []), ...activityAdds],
      });
    }
  }

  return { updatedItems, summary };
}
