import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests never import CSS; skip the app's Tailwind v4 PostCSS pipeline, which
  // Vite's config loader can't consume here.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // `import "server-only"` throws outside a React Server bundle; in tests
      // we swap it for an empty module so server code imports cleanly.
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
