import type { Metadata } from "next";
import { ChatView } from "./ChatView";

export const metadata: Metadata = { title: "Чат с диспетчером" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/chat` — full master ↔ dispatcher chat (plan §18.3 W2).
 *
 * Replaces the V1 placeholder. Mirrors master-pwa's chat: 5-second polling,
 * grouped-by-day layout, send text / photo, optimistic append on send.
 * No WebSocket — polling is what the original uses and avoids extra infra.
 */
export default function CabinetChatPage() {
  return <ChatView />;
}
