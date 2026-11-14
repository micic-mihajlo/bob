/**
 * Every hosted address the desktop app, its packages and its scripts call, in one place.
 *
 * They still name Bob's hosts on purpose: Bob has no hosted services of its own yet. Changing a
 * value here moves each caller of it. Each value is spelled out, so one host can move without the
 * others. Names baked into the prebuilt remote-desktop runtime (`/api/bob/*`,
 * `BOB_REMOTE_SETUP`, the `Bob-*` headers) are not addresses and are not here.
 */

/** The public website: invitations, agent and plugin share links, the web client, changelog and guides. */
export const BOB_WEBSITE_HOST = "bob.run";
export const BOB_WEBSITE_ORIGIN = "https://bob.run";
export const BOB_CHANGELOG_URL = "https://bob.run/changelog";
export const BOB_GUIDES_URL = "https://bob.run/guides";

/** The account service (`apps/auth-api`): sign-in, profiles, servers, invitations, marketplace. */
export const BOB_ACCOUNT_API_ORIGIN = "https://api.bob.run";

/** Signal: the WebSocket relay for remote control and the Slack, Telegram and webhook ingress. */
export const BOB_SIGNAL_ORIGIN = "https://signal.bob.run";
export const BOB_SIGNAL_URL = "wss://signal.bob.run/v1/signal";

/** The self-hosted OpenPanel that product analytics and error reports go to. */
export const BOB_ANALYTICS_API_URL = "https://analytics.bob.run/api";

/** The status page. */
export const BOB_STATUS_ORIGIN = "https://status.bob.run";

/** A Redirect Rule in the website's Cloudflare zone sends this to the current Discord invite. */
export const BOB_DISCORD_INVITE_URL = "https://discord.bob.run";

/** The address people write to. */
export const BOB_CONTACT_EMAIL = "hello@bob.run";

/** A hosted team server answers on `<name>-<8 base32>-host.<this domain>`. */
export const BOB_TEAM_HOST_DOMAIN = "bob.run";

/** Published sites answer on `<label>.<this domain>`. */
export const BOB_HOSTED_SITE_DOMAIN = "bob.site";

/** The domain of each routine's calendar event UID. Changing it gives every event a new identity. */
export const BOB_ROUTINE_UID_DOMAIN = "routines.bob.run";
