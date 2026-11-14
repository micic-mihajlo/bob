/**
 * The X display the agents work on, when it is not the display Bob shows its windows on.
 *
 * The server scripts name it in `BOB_AGENT_DISPLAY`: the boat desktop on a hosted server, else a
 * second virtual display. Bob keeps its own `DISPLAY`, because its built-in browser draws its
 * tabs in the Bob window. The Computer Use driver, remote desktop and the agent processes get
 * the agent display, so an agent's screenshot does not show Bob, remote desktop shows what the
 * agent works on, and a program an agent starts opens where the driver can see it.
 *
 * On a computer with a person at it, nothing sets the variable and everything shares one display.
 */
export function agentDisplayEnvironment(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<Record<string, string>> {
  const display = platform === "linux" ? environment.BOB_AGENT_DISPLAY : undefined;
  return display ? { DISPLAY: display } : {};
}

/** Whether the agents have a display of their own, which Bob's windows are not on. */
export function hasSeparateAgentDisplay(platform: NodeJS.Platform, environment: NodeJS.ProcessEnv = process.env) {
  return "DISPLAY" in agentDisplayEnvironment(platform, environment);
}
