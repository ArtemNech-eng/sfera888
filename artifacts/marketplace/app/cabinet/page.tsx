import { redirect } from "next/navigation";

/**
 * `/cabinet` is an entry point — sends the master to the orders board, which
 * is the most-used screen. Mirrors the master-pwa root behaviour so push
 * notifications, install prompts, and bookmarks all land in one canonical
 * place.
 */
export default function CabinetIndexPage(): never {
  redirect("/cabinet/orders");
}
