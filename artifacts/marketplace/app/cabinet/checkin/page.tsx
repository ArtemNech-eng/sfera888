import type { Metadata } from "next";
import { CheckinView } from "./CheckinView";

export const metadata: Metadata = { title: "Готовность на сегодня" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/checkin` — daily readiness toggle (plan §18.3 W2).
 *
 * Replaces the V1 placeholder with the real flow: master either confirms
 * "ready today" or "not today, take a break" before the dispatcher starts
 * routing leads. Server stores one row per (master, date) — re-submitting
 * just updates the value via ON CONFLICT.
 */
export default function CabinetCheckinPage() {
  return <CheckinView />;
}
