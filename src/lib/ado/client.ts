import "server-only";

// Thin, dependency-free client over the Azure DevOps REST API.
//
// The MCP connector we use in a Claude session does NOT exist on Vercel, so the
// hosted app authenticates to ADO itself with a Personal Access Token (scope:
// Work Items → Read) supplied as the ADO_PAT env var. Org and project default to
// CampMinder's values but are overridable. The project name uses the company's
// legacy capitalization on purpose — match it exactly in API paths.

const ORG = process.env.ADO_ORG || "CampMinderLLC";
const PROJECT = process.env.ADO_PROJECT || "CampMinder";
const API_VERSION = "7.1";

// Fields we pull. Keep this list minimal — Loop references ADO, never mirrors it.
export const ADO_FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.IterationPath",
  "System.WorkItemType",
] as const;

export interface AdoWorkItem {
  id: number;
  state: string;
  iteration: string; // last segment of System.IterationPath, "" if none
  type: string;
  title: string;
}

export function adoConfigured(): boolean {
  return Boolean(process.env.ADO_PAT);
}

// Extracts the numeric work-item id from any ADO url shape we might store:
//   https://dev.azure.com/{org}/{project}/_workitems/edit/8166
//   https://dev.azure.com/{org}/{project}/_workitems/edit/8166/Some-Title
//   https://{org}.visualstudio.com/{project}/_workitems/edit/8166
//   https://dev.azure.com/{org}/{proj}/_apis/wit/workItems/8166
// Returns null if no id is present (e.g. a blank or malformed link).
export function parseWorkItemId(url: string): number | null {
  if (!url) return null;
  const m =
    url.match(/_workitems\/edit\/(\d+)/i) ||
    url.match(/\/workItems\/(\d+)/i) ||
    url.match(/[?&]id=(\d+)/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function authHeader(): string {
  const pat = process.env.ADO_PAT;
  if (!pat) throw new Error("ADO_PAT is not set");
  // ADO Basic auth: empty username, PAT as password.
  return "Basic " + Buffer.from(":" + pat).toString("base64");
}

function iterationName(iterationPath: unknown): string {
  if (typeof iterationPath !== "string" || !iterationPath) return "";
  const parts = iterationPath.split("\\").filter(Boolean);
  // First segment is the project root; anything after it is the real iteration.
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

// Fetches many work items in one call via the batch endpoint. Missing/denied ids
// are simply absent from the returned map — callers detect them by lookup miss.
//
// This relies on errorPolicy: "Omit" in the request body. The endpoint defaults
// to "Fail", which aborts the ENTIRE batch with a non-2xx status if even one id
// is deleted, in another project, or invisible to the PAT — so a single stale
// adoUrl would break sync for every item. "Omit" drops the bad ids instead.
export async function fetchWorkItems(
  ids: number[],
): Promise<Map<number, AdoWorkItem>> {
  const out = new Map<number, AdoWorkItem>();
  const unique = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
  if (unique.length === 0) return out;

  const url = `https://dev.azure.com/${ORG}/${encodeURIComponent(
    PROJECT,
  )}/_apis/wit/workitemsbatch?api-version=${API_VERSION}`;

  // The batch endpoint caps at 200 ids per request.
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: chunk, fields: ADO_FIELDS, errorPolicy: "Omit" }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `ADO batch request failed (${res.status} ${res.statusText})` +
          (body ? `: ${body.slice(0, 300)}` : ""),
      );
    }
    const json = (await res.json()) as {
      value?: Array<{ id: number; fields?: Record<string, unknown> }>;
    };
    for (const wi of json.value ?? []) {
      const f = wi.fields ?? {};
      out.set(wi.id, {
        id: wi.id,
        state: String(f["System.State"] ?? ""),
        iteration: iterationName(f["System.IterationPath"]),
        type: String(f["System.WorkItemType"] ?? ""),
        title: String(f["System.Title"] ?? ""),
      });
    }
  }
  return out;
}
