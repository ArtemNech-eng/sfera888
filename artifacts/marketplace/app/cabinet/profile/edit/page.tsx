import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentMaster } from "@/lib/cabinetAuth";
import { ProfileEditor } from "./ProfileEditor";

export const metadata: Metadata = { title: "Редактирование профиля" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/profile/edit` — full master profile editor (plan §18.3 W2).
 *
 * Inline section-by-section editor mirroring master-pwa profile.tsx —
 * identity, public marketplace card, working hours, order filters, service
 * prices, availability and avatar upload. Each section saves independently
 * via PATCH /profile or its dedicated endpoint, so the master can update
 * a single field without re-validating the whole form.
 */
export default async function CabinetProfileEditPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/login?next=/cabinet/profile/edit");
  return <ProfileEditor />;
}
