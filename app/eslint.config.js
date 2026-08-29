import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // shadcn/ui vendored components are excluded from lint churn; app code is not.
  { ignores: ["dist/**", "src/*/components/ui/**", "src/*/hooks/use-toast.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
);
