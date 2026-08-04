"use client";

import {
  MODULES,
  JTBDS,
  TEAM_DOMAIN,
  UNCLAIMED_DOMAIN_ID,
  moduleDomainId,
  getDomain,
} from "@/lib/loop/taxonomy";

// Picks the durable module an item is anchored to (see taxonomy.ts). Options are
// grouped by "Domain › JTBD" so the ~70 tiles stay legible. Below the select we
// show the resolved domain (and its owner) so the user sees exactly where the
// work lands — including the team-based fallback when no module is chosen yet.
export function ModuleSelect({
  value,
  mission,
  onChange,
}: {
  value: string | null;
  mission: string;
  onChange: (id: string | null) => void;
}) {
  const resolvedDomainId =
    moduleDomainId(value) ?? TEAM_DOMAIN[mission] ?? UNCLAIMED_DOMAIN_ID;
  const domain = getDomain(resolvedDomainId);

  return (
    <div className="field">
      <label>Module</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— None (falls back to team) —</option>
        {JTBDS.map((jtbd) => {
          const dom = getDomain(jtbd.domainId);
          const mods = MODULES.filter((m) => m.jtbdId === jtbd.id);
          if (!mods.length) return null;
          return (
            <optgroup
              key={jtbd.id}
              label={`${dom?.label ?? ""} › ${jtbd.label}`}
            >
              {mods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
        Domain: {domain?.label ?? "Unclaimed Property"}
        {domain?.owner ? ` · ${domain.owner}` : ""}
        {!value ? " (from team)" : ""}
      </p>
    </div>
  );
}
