/** Runs once when the server starts, before it serves a request. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.BOB_DURABLE !== "cloudflare") return;
  const { restoreFromDurable } = await import("./lib/durable");
  const { outcome, rev } = await restoreFromDurable();
  console.info(`Durable state: ${outcome}${rev === undefined ? "" : ` (rev ${rev})`}`);
}
