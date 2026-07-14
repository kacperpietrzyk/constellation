import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: "src/preload.ts",
      fileName: () => "preload.cjs",
      formats: ["cjs"],
    },
    outDir: "build",
    rollupOptions: { external: ["electron"] },
  },
});
