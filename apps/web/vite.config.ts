import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@millbrook/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "@millbrook/economy": fileURLToPath(new URL("../../packages/economy/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
