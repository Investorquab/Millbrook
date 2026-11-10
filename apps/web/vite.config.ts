import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // In this pnpm monorepo React can resolve to more than one copy, which makes
    // React Three Fiber's reconciler read a null hook dispatcher ("Cannot read
    // properties of null (reading 'useMemo')"). Force a single copy of React and
    // the three stack.
    dedupe: ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei"],
    alias: {
      "@millbrook/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "@millbrook/economy": fileURLToPath(new URL("../../packages/economy/src/index.ts", import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "three", "@react-three/fiber", "@react-three/drei"],
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
