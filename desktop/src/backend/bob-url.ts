/** Bob's Next dev server at the repo root, where the BobAgent routes live. BOB_URL overrides it. */
export const DEFAULT_BOB_URL = "http://localhost:3000";

export function bobUrl(): string {
  return (process.env.BOB_URL || DEFAULT_BOB_URL).replace(/\/+$/u, "");
}
