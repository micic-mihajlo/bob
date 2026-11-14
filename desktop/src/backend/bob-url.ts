/** The deployed BobAgent Worker, stage dev of `apps/cloud`. BOB_URL overrides it, e.g. http://localhost:1337 for `bun run dev` there. */
export const DEFAULT_BOB_URL = "https://bob-api-dev-tsxgmaglukkvsvfx.jason-cameron-32b.workers.dev";

export function bobUrl(): string {
  return (process.env.BOB_URL || DEFAULT_BOB_URL).replace(/\/+$/u, "");
}
