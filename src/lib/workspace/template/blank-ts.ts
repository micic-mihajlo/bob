/**
 * The blank TypeScript project a new project can start from: one module, one test and the tooling to run them,
 * with nothing in it about any one app. Kept as strings for the same reason as the invoices sample.
 */
import type { TemplateFile } from "./files";

const readme = `# App

A blank TypeScript project.

- \`src/index.ts\`: where the code starts.
- \`src/*.test.ts\`: vitest tests next to the code they check.

Run the tests with \`npm test\` and the type check with \`npm run typecheck\`.
`;

const packageJson = `{
  "name": "app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "fast-check": "4.10.2",
    "typescript": "5.9.3",
    "vitest": "5.1.0"
  }
}
`;

const tsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`;

const gitignore = `node_modules
`;

const index = `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;

const indexTest = `import { describe, expect, it } from "vitest";
import { greet } from "./index";

describe("greet", () => {
  it("greets by name", () => {
    expect(greet("Ada")).toBe("Hello, Ada!");
  });
});
`;

export const BLANK_TS_FILES: readonly TemplateFile[] = [
  { path: "README.md", content: readme },
  { path: "package.json", content: packageJson },
  { path: "tsconfig.json", content: tsconfig },
  { path: ".gitignore", content: gitignore },
  { path: "src/index.ts", content: index },
  { path: "src/index.test.ts", content: indexTest },
];
