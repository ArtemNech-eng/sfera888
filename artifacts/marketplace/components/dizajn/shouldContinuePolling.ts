/**
 * Pure polling predicate for the `Pending_Page` (`DesignBoardPending`).
 *
 * This module is intentionally **pure** and free of React / browser imports so
 * that it can be imported and exercised deterministically by the polling
 * property test (ai-design-flagship, Property 16) without mounting the
 * component or faking timers.
 *
 * Contract (Requirement 2.8): while a `Design_Project` is still being generated
 * (`Generation_Status === "generating"`) the `Pending_Page` keeps polling; once
 * the status reaches a terminal value (`completed`, `failed`, or any other
 * non-`generating` status such as `draft` / `private`) polling stops.
 */

import type { DesignStatus } from "../../lib/types";

/**
 * The single non-terminal `Generation_Status`. Only while the project sits in
 * this status is there anything left to wait for; every other status is
 * terminal from the `Pending_Page`'s point of view.
 */
export const NON_TERMINAL_STATUS: DesignStatus = "generating";

/**
 * Returns `true` iff the `Pending_Page` should keep polling for status changes.
 *
 * Polling continues if and only if the status is non-terminal (`generating`).
 * For every terminal status (`completed`, `failed`, and the remaining
 * non-`generating` statuses) it returns `false`.
 *
 * Pure & deterministic: the result depends only on `status`.
 */
export function shouldContinuePolling(status: DesignStatus): boolean {
  return status === NON_TERMINAL_STATUS;
}
