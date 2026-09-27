import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"] },
  {
    // React Compiler rules new in eslint-config-next 16. Existing findings are
    // tracked as warnings until each component is reworked, not silenced.
    rules: {
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
