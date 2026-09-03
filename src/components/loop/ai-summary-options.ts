// Shared option types for AiSummaryPopover's three independent controls.

export type Audience = "exec" | "team";
export type Length = "short" | "medium" | "long";
export type Format = "prose" | "bullets";

export type SummaryOptions = { audience: Audience; length: Length; format: Format };
