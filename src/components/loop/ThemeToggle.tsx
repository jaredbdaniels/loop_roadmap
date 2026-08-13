"use client";

import { Moon, Monitor, Sun } from "lucide-react";
import { useTheme } from "./useTheme";

const NEXT: Record<"light" | "dark" | "system", "light" | "dark" | "system"> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const LABEL: Record<"light" | "dark" | "system", string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

// Light → Dark → System → Light. A viewer preference, not an edit
// permission — mounted unconditionally in the topbar so share-link readers
// get it too, unlike the sign-out controls next to it.
export function ThemeToggle() {
  const { theme, cycle } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const title = `Theme: ${LABEL[theme]} — click for ${LABEL[NEXT[theme]]}`;

  return (
    <button className="sync-chip theme-toggle" onClick={cycle} title={title} aria-label={title}>
      <Icon size={13} strokeWidth={2.4} aria-hidden />
    </button>
  );
}
