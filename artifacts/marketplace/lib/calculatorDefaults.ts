/**
 * Calculator UX helpers — labels, formatters, category metadata.
 *
 * **Where the math lives**: server-side, in
 * `artifacts/api-server/src/lib/calculatorEngine.ts`. The marketplace just
 * renders `CalculatorEstimate` returned by `/api/marketplace/calculator/
 * estimate`. This file used to host fallback constants for an MVP; it now
 * carries only presentation primitives so client and server never disagree.
 */

import type { CalcCategory } from "./types";

/** Human-friendly labels + descriptions used by the form and the result page. */
export const CATEGORY_META: Record<CalcCategory, { label: string; description: string; tint: "indigo" | "amber" | "teal" }> = {
  kosmetic: {
    label: "Косметический",
    description: "Покраска, обои, замена сантехники по местам, мелкая отделка.",
    tint: "indigo",
  },
  evro: {
    label: "Евро (под ключ)",
    description: "Полный ремонт под ключ, замена коммуникаций, выравнивание стен.",
    tint: "teal",
  },
  premium: {
    label: "Премиум",
    description: "Авторский дизайн, дорогие материалы, нестандартные решения, дизайнерский надзор.",
    tint: "amber",
  },
};

/** ru-RU thousands-separated rubles, no kopecks. */
export function formatRubles(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

/** Plural for "день / дня / дней" — used for duration ranges. */
export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

/** Plural for "проект / проекта / проектов" used in social-proof copy. */
export function pluralProjects(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "проектов";
  if (mod10 === 1) return "проект";
  if (mod10 >= 2 && mod10 <= 4) return "проекта";
  return "проектов";
}

/** Defaults shown in form fields when no query params are present. */
export const DEFAULT_AREA = 55;
export const DEFAULT_CATEGORY: CalcCategory = "evro";
