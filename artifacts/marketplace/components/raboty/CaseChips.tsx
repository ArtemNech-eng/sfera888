interface CaseChipsProps {
  cityName: string | null;
  area: number | null;
  priceRange: string | null;
  serviceName: string | null;
  // Iter 2 fields — props в API будут добавлены позже, сейчас фронт уже умеет их рендерить.
  durationDays?: number | null;
  housingType?: HousingType | null;
}

export type HousingType = "novostroyka" | "vtorichka" | "chastnyy_dom" | "kommerciya";

const HOUSING_LABEL: Record<HousingType, string> = {
  novostroyka: "Новостройка",
  vtorichka: "Вторичка",
  chastnyy_dom: "Частный дом",
  kommerciya: "Коммерция",
};

/**
 * Inline characteristic chips for a case (plan §22, Requirement 2).
 *
 * Renders only the chips that have data. Server component, no JS.
 * Layout: horizontal wrap, ~40 px row height, no border, cream-deep
 * background. Iconography — inline SVG (not emoji) for cross-platform
 * crispness.
 */
export function CaseChips({
  cityName,
  area,
  priceRange,
  serviceName,
  durationDays,
  housingType,
}: CaseChipsProps) {
  const chips: { icon: React.ReactNode; label: string }[] = [];

  if (cityName) chips.push({ icon: <IconPin />, label: cityName });
  if (area != null && area > 0) chips.push({ icon: <IconArea />, label: `${formatArea(area)} м²` });
  if (durationDays != null && durationDays > 0) {
    chips.push({ icon: <IconClock />, label: `${durationDays} ${pluralDays(durationDays)}` });
  }
  if (priceRange) chips.push({ icon: <IconRuble />, label: priceRange });
  if (serviceName) chips.push({ icon: <IconHammer />, label: serviceName });
  if (housingType) chips.push({ icon: <IconBuilding />, label: HOUSING_LABEL[housingType] });

  if (chips.length === 0) return null;

  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-7">
        <ul className="flex flex-wrap gap-2">
          {chips.map((chip, idx) => (
            <li
              key={idx}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--color-cream-deep)] px-4 text-sm font-medium text-[var(--color-text)]"
            >
              <span aria-hidden className="text-[var(--color-primary)]">
                {chip.icon}
              </span>
              <span>{chip.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Icons (inline SVG, 16px, currentColor) ─────────────────────────────────

function IconPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconArea() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 8h18M8 3v18" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconRuble() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4h6a4 4 0 0 1 0 8H8" />
      <path d="M8 4v16" />
      <path d="M5 12h9" />
      <path d="M5 16h9" />
    </svg>
  );
}

function IconHammer() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 12-8.5 8.5a1.5 1.5 0 0 1-2.12-2.12L13 9" />
      <path d="M17.64 6.36 14 10l4 4 3.64-3.64a2.5 2.5 0 0 0 0-3.54l-.46-.46a2.5 2.5 0 0 0-3.54 0Z" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01" />
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatArea(n: number): string {
  // Show "5,4" for fractional area, "120" for whole numbers.
  return n % 1 === 0
    ? String(Math.round(n))
    : n.toFixed(1).replace(".", ",");
}

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}
