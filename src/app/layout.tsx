import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campminder Product Launchpad · Closing product loops faster",
  description:
    "Product Launchpad is Campminder's internal idea-to-outcome tool — closing product loops faster. The idea layer above Notion, Azure DevOps, and the data stack.",
  icons: {
    icon: "/brand/cm-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
