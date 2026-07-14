import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".ui-craft/**",
      ".workbench/**",
      ".workflows/**",
      "docs/plans/**",
      "docs/specs/**",
      "node_modules/**",
      "release/**",
      "**/dist/**",
      "**/build/**",
      "coverage/**",
      "plans/**",
      "specs/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
