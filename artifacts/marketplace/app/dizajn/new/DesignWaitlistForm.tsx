"use client";
import { useState } from "react";
import { LeadForm } from "../../../components/LeadForm";

const ROOM_TYPES = [
  { value: "vannaya", label: "ванная" },
  { value: "kuhnya", label: "кухня" },
  { value: "gostinaya", label: "гостиная" },
  { value: "spalnya", label: "спальня" },
  { value: "prihozhaya", label: "прихожая" },
];

const STYLES = [
  { value: "sovremennyy", label: "современный" },
  { value: "skandinavskiy", label: "скандинавский" },
  { value: "loft", label: "лофт" },
  { value: "minimalizm", label: "минимализм" },
  { value: "neoklassika", label: "неоклассика" },
];

interface Props {
  sourcePageUrl: string;
}

/**
 * Design-waitlist form. AI generation is not wired up yet, so instead of
 * pretending to "generate" we collect early-access leads.
 *
 * Behaviour:
 *   • Two local-state selects (room type + style). They never get sent
 *     directly to the backend — instead they're rendered into a sentence
 *     that becomes the lead's `comment` prefix ("Запись в ранний доступ
 *     AI-дизайнера: ванная, скандинавский").
 *   • The actual fields (phone / name / consent / honeypot / formStartedAt)
 *     and all anti-spam logic come from the standard `<LeadForm/>`.
 *   • `citySlug` / `serviceSlug` are hardcoded to defaults required by the
 *     api-server's FK validation. Operator will confirm the actual city
 *     when calling back.
 *
 * No file upload here — until the AI pipeline runs we don't want browser
 * blob URLs that go nowhere. When generation lands, this component will be
 * replaced with the real designer flow.
 */
export function DesignWaitlistForm({ sourcePageUrl }: Props) {
  const [roomType, setRoomType] = useState("");
  const [styleValue, setStyleValue] = useState("");

  const roomLabel = ROOM_TYPES.find((r) => r.value === roomType)?.label ?? "";
  const styleLabel = STYLES.find((s) => s.value === styleValue)?.label ?? "";

  // Always-prepended sentence in the lead's comment so the operator
  // immediately understands what the user is asking for.
  let commentPrefix = "Запись в ранний доступ AI-дизайнера";
  const choice = [roomLabel, styleLabel].filter((s) => s.length > 0).join(", ");
  if (choice.length > 0) {
    commentPrefix = `Запись в ранний доступ AI-дизайнера: ${choice}`;
  }

  return (
    <div className="grid gap-5">
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-[var(--color-text)]">Тип помещения</span>
        <select
          value={roomType}
          onChange={(e) => setRoomType(e.target.value)}
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
        >
          <option value="">Любой / уточним позже</option>
          {ROOM_TYPES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-[var(--color-text)]">Стиль</span>
        <select
          value={styleValue}
          onChange={(e) => setStyleValue(e.target.value)}
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
        >
          <option value="">Любой / уточним позже</option>
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <LeadForm
        // City / service are hardcoded defaults required by the api-server
        // FK validation. Operator will confirm the actual city by phone.
        citySlug="krasnodar"
        serviceSlug="kompleksnyy-remont"
        sourcePageUrl={sourcePageUrl}
        commentPrefix={commentPrefix}
        sourcePageType="design_waitlist"
      />
    </div>
  );
}
