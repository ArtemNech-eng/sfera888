import type { Metadata } from "next";
import { ScheduleView } from "./ScheduleView";

export const metadata: Metadata = { title: "Расписание" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/schedule` — 7-day rolling agenda of scheduled active orders
 * (plan §18.3 W2 polish). Replaces the V1 placeholder.
 *
 * Master-pwa never had a dedicated calendar — orders.tsx mixed scheduled
 * and unscheduled in one list. The cabinet adds a proper agenda view since
 * masters work multiple sites per day and need a glanceable plan.
 */
export default function CabinetSchedulePage() {
  return <ScheduleView />;
}
