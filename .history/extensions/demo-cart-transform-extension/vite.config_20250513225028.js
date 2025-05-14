// Prevents inheritance from parent Remix project
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "node18",
  },
  platform: "node",
});
