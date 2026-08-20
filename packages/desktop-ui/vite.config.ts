import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { treeshake: { moduleSideEffects: false } },
  },
  plugins: [react()],
  resolve: { dedupe: ["@tiptap/core"] },
});
