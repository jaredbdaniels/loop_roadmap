// Pure helper for AiSummaryPopover's three independent controls (audience,
// length, format). Pulled out of the component so the defaulting logic —
// "whichever dimension was just clicked wins, the other two keep their
// current value" — is unit-testable without React or a DOM.

export type Audience = "exec" | "team";
export type Length = "short" | "medium" | "long";
export type Format = "prose" | "bullets";

export type SummaryOptions = { audience: Audience; length: Length; format: Format };

export function resolveSummaryOptions(
  current: SummaryOptions,
  overrides: Partial<SummaryOptions>,
): SummaryOptions {
  return {
    audience: overrides.audience ?? current.audience,
    length: overrides.length ?? current.length,
    format: overrides.format ?? current.format,
  };
}
