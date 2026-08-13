import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campminder Product Launchpad · Closing product loops faster",
  description:
    "Product Launchpad is Campminder's internal idea-to-outcome tool — closing product loops faster. The idea layer above Notion, Azure DevOps, and the data stack.",
  icons: {
    icon: "/brand/cm-icon.svg",
  },
};

// `metadata.themeColor` is deprecated in favour of this — it's what lets the
// mobile browser chrome (status bar / URL bar) match the topbar instead of
// staying the light color while the page itself has gone dark.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#380f8c" },
    { media: "(prefers-color-scheme: dark)", color: "#1a0440" },
  ],
};

// Sets `data-theme` on `<html>` before hydration so a light/dark choice never
// flashes the wrong theme on first paint. System mode sets no attribute at
// all — CSS's `prefers-color-scheme` handles that case on its own, and this
// script has nothing to do. Wrapped in try/catch because a browser that
// blocks storage (Safari private mode, cookies disabled) should just fall
// back to System rather than throwing before the app has even mounted.
const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("loop-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The bootstrap script below mutates documentElement's attributes
    // before React hydrates, which is exactly the kind of mismatch this prop
    // exists to silence.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
