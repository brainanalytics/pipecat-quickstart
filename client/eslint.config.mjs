import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Global rule overrides
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // File-specific overrides
    files: ["src/components/**/*.tsx", "src/app/**/*.tsx"],
    rules: {
      // More lenient rules for component files
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Config files can be even more lenient
    files: ["*.config.js", "*.config.ts", "tailwind.config.js"],
    rules: {
      "@typescript-eslint/no-var-requires": "off",
    },
  },
];

export default eslintConfig;
