/**
 * Pure Add_Place_Form option source — Стадия 2 (community-generalized-locality).
 *
 * The Add_Place_Form (`components/community/CreateZhkForm.tsx`) lets a Resident
 * pick the Locality_Kind of the place they add (Requirement 4.1). The list of
 * selectable kinds is extracted here as a pure, server-free constant (no
 * `"use client"`, no React, no `next/*`) so it can be imported and asserted by
 * the form-options unit test (task 9.5) without dragging in the Next.js client
 * runtime or a DOM.
 *
 * Contract encoded here (Requirement 4.1): the form exposes exactly the three
 * Locality_Kind values `zhk`, `district`, `settlement` — no more, no less —
 * with human-readable Russian labels. `zhk` stays first as the default for
 * backward compatibility.
 */

import type { CommunityLocalityKind } from "./types";

/** Одна опция выбора типа места в Add_Place_Form. */
export interface LocalityKindOption {
  value: CommunityLocalityKind;
  label: string;
}

/**
 * Опции выбора типа локации (Locality_Kind, Requirement 4.1). Человекочитаемые
 * подписи для трёх типов места; значение по умолчанию — `zhk` (первым в списке
 * ради обратной совместимости).
 */
export const LOCALITY_KIND_OPTIONS: readonly LocalityKindOption[] = [
  { value: "zhk", label: "Жилой комплекс / новостройка" },
  { value: "district", label: "Район / микрорайон" },
  { value: "settlement", label: "Посёлок / частный сектор" },
] as const;
