import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypeScript,
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "docs/**",
      // The Electron main-process shell uses CommonJS (`require`) by design.
      // The TypeScript no-require-imports rule does not apply there.
      "electron/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
