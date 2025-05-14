// Prevents inheritance from parent Remix project
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "node18",
    rollupOptions: {
      external: [
        "node:module",
        "node:path",
        "node:process",
        "node:url",
        "node:fs",
        "node:child_process",
        "node:fs/promises",
        "node:os",
        "node:util",
        "node:async_hooks",
        "node:events",
      ],
    },
  },
  platform: "node",
});
