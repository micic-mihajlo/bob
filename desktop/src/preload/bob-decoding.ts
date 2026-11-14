// What main answers for Bob's first run.

import { isBobOnboardingResult } from "@bob/contracts/ipc";
import { guardedDecoder } from "@bob/contracts/ipc-decoding";

export const decodeBobOnboardingResult = guardedDecoder(isBobOnboardingResult, "Bob onboarding response");
