import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ad-hoc verification scratch scripts, not part of the app build.
    "verify_*.js",
  ]),
  {
    rules: {
      // API payloads are still loosely typed in the page components; surfaced
      // as warnings so CI stays meaningful instead of being switched off.
      "@typescript-eslint/no-explicit-any": "warn",
      // "Offline" is genuinely a function of the current time, so the freshness
      // check has to read the clock while rendering.
      "react-hooks/purity": "warn",
      // Every page fetches from the Express API inside an effect and stores the
      // result in state, and the socket resource is created the same way.
      // Clearing this properly means adopting a data-fetching library, so it is
      // tracked as a warning rather than switched off.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
