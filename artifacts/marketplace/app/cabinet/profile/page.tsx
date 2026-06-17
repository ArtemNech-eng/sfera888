import type { Metadata } from "next";
import { ProfileView } from "./ProfileView";

export const metadata: Metadata = { title: "Профиль" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/profile` — read-only first iteration (plan §18.3 W2).
 *
 * Replaces the V1 placeholder with a working overview: identity, public
 * profile state (with a deep-link to /master/{slug} when published),
 * stats, specializations, prices, working hours, Max-bot integration.
 *
 * Editing waits for the next port that brings over the EditProfileModal
 * sheet from master-pwa. Until then, "Редактировать" buttons throughout
 * the page deep-link to the master-pwa app.
 */
export default function CabinetProfilePage() {
  return <ProfileView />;
}
