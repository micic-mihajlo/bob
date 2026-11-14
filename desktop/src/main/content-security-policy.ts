import { isMobileConnectDevelopmentHost } from "@bob/contracts/mobile-connect";

export function buildContentSecurityPolicy(
  packaged: boolean,
  developmentSignalUrl?: string,
  selfHostedSignalOrigin?: string | null,
): string {
  const selfHostedSignalSource = selfHostedSignalOrigin ? ` ${selfHostedSignalOrigin}` : "";
  const developmentSources = packaged
    ? ""
    : ` http://localhost:* ws://localhost:*${developmentSignalSource(developmentSignalUrl)}`;
  const developmentImageSources = packaged ? "" : " http://127.0.0.1:* http://localhost:*";

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: bob-attachment: bob-remote-attachment: bob-avatar: bob-remote-avatar: bob-server-logo: bob-remote-server-logo: https:${developmentImageSources}`,
    "font-src 'self' data:",
    // The lightbox plays a recording from the attachment scheme, and the preview panel plays one
    // from an object URL of the bytes that the main process sent. Neither matches `default-src`.
    "media-src 'self' blob: bob-attachment: bob-remote-attachment:",
    `connect-src 'self' bob-attachment: bob-remote-attachment: ws://127.0.0.1:*${selfHostedSignalSource}${developmentSources}`,
    "object-src 'none'",
    // The remote desktop viewer uses a loopback proxy in packaged apps too.
    "frame-src 'self' bob-attachment: bob-remote-attachment: bob-visual: bob-remote-visual: http://127.0.0.1:* http://localhost:*",
    "base-uri 'none'",
  ].join("; ");
}

/**
 * The Signal origin of a self-hosted Account API. The Worker still chooses the URL in each ticket;
 * this only lets the peer window open it. It needs `BOB_AUTH_API_URL`, because our Worker never
 * issues a ticket for another Signal.
 */
export function readSelfHostedSignalOrigin(
  authApiUrl: string | undefined,
  signalUrl: string | undefined,
): string | null {
  if (!signalUrl) return null;
  if (!authApiUrl) throw new Error("BOB_REMOTE_SIGNAL_URL needs BOB_AUTH_API_URL.");
  const url = new URL(signalUrl);
  if (url.protocol !== "wss:" || url.username !== "" || url.password !== "") {
    throw new Error("BOB_REMOTE_SIGNAL_URL must be a wss: URL without credentials.");
  }
  return url.origin;
}

function developmentSignalSource(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "ws:" ||
      !isMobileConnectDevelopmentHost(url.hostname) ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return "";
    }
    return ` ${url.origin}`;
  } catch {
    return "";
  }
}
