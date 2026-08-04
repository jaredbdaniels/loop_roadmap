"use client";

import { useCallback, useEffect, useState } from "react";

// Map the route's error codes to a message we're happy to show a user.
export function friendlyAiError(code: string): string {
  switch (code) {
    case "ai_disabled":
      return "AI suggestions are turned off.";
    case "unauthorized":
      return "Your session expired — sign in again.";
    case "ai_unavailable":
      return "Couldn't reach the assistant. Try again in a moment.";
    default:
      return "Couldn't get a suggestion. Try again.";
  }
}

async function postAi<T>(feature: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/ai/${feature}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("network");
  }
  if (!res.ok) {
    let code = "ai_unavailable";
    try {
      code = (await res.json())?.error ?? code;
    } catch {
      /* non-JSON error body — keep the default */
    }
    throw new Error(code);
  }
  return (await res.json()) as T;
}

// One status probe per page load, shared across every SuggestButton.
let statusPromise: Promise<boolean> | null = null;
function probeEnabled(): Promise<boolean> {
  if (!statusPromise) {
    statusPromise = fetch("/api/ai/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => !!d?.enabled)
      .catch(() => false);
  }
  return statusPromise;
}

// Whether to render AI affordances at all. False until the probe resolves, so
// buttons never flash in when the feature is off.
export function useAiEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    probeEnabled().then((e) => {
      if (alive) setEnabled(e);
    });
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}

// Run one AI feature. `run` never throws — it returns `{ data, error }` so the
// caller can toast a friendly message and leave the form untouched on failure.
export function useAiSuggestion<T>(feature: string) {
  const [loading, setLoading] = useState(false);
  const run = useCallback(
    async (body: unknown): Promise<{ data: T | null; error: string | null }> => {
      setLoading(true);
      try {
        const data = await postAi<T>(feature, body);
        return { data, error: null };
      } catch (err) {
        return { data: null, error: friendlyAiError((err as Error).message) };
      } finally {
        setLoading(false);
      }
    },
    [feature],
  );
  return { run, loading };
}
