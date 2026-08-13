"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

const STORAGE_KEY = "loop-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Same two colors as the `media`-keyed pair in layout.tsx's `viewport.themeColor`
// — that pair is what the mobile browser chrome uses before hydration (and for
// as long as the user stays on System), so an explicit choice has to resolve to
// the identical values or the chrome would visibly jump when JS takes over.
const THEME_COLOR: Record<"light" | "dark", string> = {
  light: "#380f8c",
  dark: "#1a0440",
};
const THEME_COLOR_META_ID = "theme-color-override";

function isThemePref(v: string | null): v is "light" | "dark" | "system" {
  return v === "light" || v === "dark" || v === "system";
}

// layout.tsx's `viewport.themeColor` only expresses "follow the OS" — it has no
// way to say "the user picked Dark on a light-set OS", so an explicit choice
// gets its own unconditional <meta name="theme-color"> that outranks the
// media-queried pair. System mode removes it again and lets that pair resume
// deciding, exactly as it does pre-hydration.
function syncThemeColorMeta(pref: ThemePref) {
  const existing = document.getElementById(THEME_COLOR_META_ID);
  if (pref === "system") {
    existing?.remove();
    return;
  }
  const meta =
    existing instanceof HTMLMetaElement
      ? existing
      : document.createElement("meta");
  meta.id = THEME_COLOR_META_ID;
  meta.setAttribute("name", "theme-color");
  meta.setAttribute("content", THEME_COLOR[pref]);
  if (!existing) document.head.appendChild(meta);
}

// Reads the stored preference, defaulting to System for anything absent or
// invalid — a corrupted or hand-edited value should degrade gracefully
// rather than crash the app.
function readStoredTheme(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isThemePref(v) ? v : "system";
  } catch {
    return "system";
  }
}

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

// The theme cycle and its one piece of client state. Split out of
// ThemeToggle so the cycling/persistence logic is testable independent of
// the icon it happens to render.
//
// `theme` starts as "system" on every render — including the client's first
// one — and only picks up the real stored value inside an effect. Reading
// localStorage during render would make the server- and client-rendered
// markup disagree (the server has no localStorage at all), so the mount
// effect is what settles it, matching the pattern SyncStatus uses for its
// client-only clock.
export function useTheme() {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(readStoredTheme());
    setMounted(true);
  }, []);

  // Only matters in System mode, but the listener is cheap enough to keep
  // subscribed regardless — it just doesn't do anything to `data-theme`
  // while an explicit choice is active, because `applyTheme` never runs
  // outside `setTheme`.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  // Keeps the mobile browser-chrome color in step with the resolved theme —
  // including the very first render after mount, when the bootstrap script in
  // layout.tsx already set `data-theme` but nothing has told the meta tag yet.
  useEffect(() => {
    syncThemeColorMeta(theme);
  }, [theme]);

  const setTheme = useCallback((pref: ThemePref) => {
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // Storage blocked — the in-memory state below still drives this tab
      // correctly, it just won't survive a reload.
    }
    applyTheme(pref);
    setThemeState(pref);
  }, []);

  const cycle = useCallback(() => {
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  }, [theme, setTheme]);

  return { theme, mounted, setTheme, cycle };
}
