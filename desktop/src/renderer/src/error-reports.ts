import type { FailureProperties } from "@bob/user-errors/failure";

/** Error reports are not collected. The calls stay so a screen does not need to know that. */
export function reportNotification(_properties: FailureProperties): void {}

export function reportErrorBanner(_error: unknown, _operation: FailureProperties["operation"] = "other"): void {}
