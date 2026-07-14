import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "src/stdio.ts",
    outDir: "dist/bin",
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: "stdio.mjs" },
    },
  },
  ssr: { noExternal: true },
});
