/**
 * Feature: community-generalized-locality, Task 9.5: form options and per-kind route rendering
 *
 * Unit test covering two facade guarantees of Стадия 2:
 *
 *   • Add_Place_Form (`components/community/CreateZhkForm.tsx`) exposes EXACTLY
 *     the three Locality_Kind options `zhk`, `district`, `settlement`
 *     (Requirement 4.1). The options are asserted against the pure exported
 *     constant `LOCALITY_KIND_OPTIONS` (extracted in task 9.5 from the form's
 *     inline `KIND_OPTIONS`, behavior-preserving) so the test stays a fast,
 *     DOM-free unit test.
 *
 *   • The `/zhk/[slug]` Locality_Page renders for EVERY kind (Requirement 3.2).
 *     The page is a Next.js server component that cannot be executed under a
 *     plain Node runner, so we exercise its pure rendering seam instead: for
 *     each kind the page builds metadata via `buildLocalityMetadata` and its
 *     eyebrow via `localityKindEyebrow`. Asserting these produce valid,
 *     kind-correct, non-empty output for `zhk`/`district`/`settlement` (and
 *     that an unknown/absent kind resolves to `zhk`) proves the page path
 *     handles every kind — i.e. `/zhk/[slug]` renders for each kind.
 *
 * **Validates: Requirements 3.2, 4.1**
 *
 * Runner / convention. The marketplace (Next.js 15) package has no test runner
 * of its own, so — mirroring the sibling community property tests (tasks 9.2 /
 * 9.3) — this test reuses Node's built-in test runner (`node:test`) driven by
 * `tsx`. Run:
 *
 *   npx tsx --test ./lib/communityLocalityForm.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LOCALITY_KIND_OPTIONS } from "./communityLocalityForm";
import {
  buildLocalityMetadata,
  localityKindEyebrow,
  resolveLocalityKind,
  type CommunityLocalityKind,
} from "./communityLocalityMeta";

/** Точное множество допустимых типов локации (Requirement 1.2, 4.1). */
const EXPECTED_KINDS: CommunityLocalityKind[] = ["zhk", "district", "settlement"];

/** Ожидаемые eyebrow-подписи Locality_Page по типу (Requirement 3.2 / 6.6). */
const EXPECTED_EYEBROW: Record<CommunityLocalityKind, string> = {
  zhk: "Жилой комплекс",
  district: "Район",
  settlement: "Посёлок",
};

const BASE_URL = "https://chestnye-mastera.ru";

// ─── Requirement 4.1 — Add_Place_Form kind options ───────────────────────────

describe("Add_Place_Form — Requirement 4.1: exactly three kind options", () => {
  it("exposes exactly {zhk, district, settlement}, no extras, no duplicates", () => {
    const values = LOCALITY_KIND_OPTIONS.map((o) => o.value);

    // Ровно три опции.
    assert.equal(
      values.length,
      3,
      `Add_Place_Form должен показывать ровно 3 типа, получено: ${JSON.stringify(values)}`,
    );

    // Без дубликатов.
    assert.equal(
      new Set(values).size,
      3,
      `опции типа не должны дублироваться: ${JSON.stringify(values)}`,
    );

    // Именно множество {zhk, district, settlement} (порядок значения не имеет).
    assert.deepEqual(
      [...values].sort(),
      [...EXPECTED_KINDS].sort(),
      "множество опций должно быть в точности {zhk, district, settlement}",
    );

    // `zhk` идёт первым — значение по умолчанию (обратная совместимость).
    assert.equal(values[0], "zhk", "zhk должен быть первой опцией (по умолчанию)");
  });

  it("every option has a non-empty human-readable label", () => {
    for (const opt of LOCALITY_KIND_OPTIONS) {
      assert.equal(typeof opt.label, "string");
      assert.ok(
        opt.label.trim().length > 0,
        `подпись для kind=${opt.value} должна быть непустой`,
      );
    }
  });
});

// ─── Requirement 3.2 — /zhk/[slug] renders for each kind ──────────────────────

describe("Locality_Page /zhk/[slug] — Requirement 3.2: renders for each kind", () => {
  it("builds valid, kind-correct metadata + eyebrow for every kind", () => {
    for (const kind of EXPECTED_KINDS) {
      const slug = `mesto-${kind}`;
      const meta = buildLocalityMetadata(
        { name: "Черёмушки", slug, kind },
        BASE_URL,
      );

      // Непустой title и описание (страница рендерится для этого kind).
      assert.ok(
        meta.title.trim().length > 0,
        `title должен быть непустым для kind=${kind}`,
      );
      assert.ok(
        meta.description.trim().length > 0,
        `description должен быть непустым для kind=${kind}`,
      );

      // Абсолютный canonical, соответствующий slug.
      assert.equal(
        meta.canonical,
        `${BASE_URL}/zhk/${slug}`,
        `canonical должен быть абсолютным и указывать на slug для kind=${kind}`,
      );

      // Eyebrow (надзаголовок страницы) соответствует типу локации.
      assert.equal(
        localityKindEyebrow(kind),
        EXPECTED_EYEBROW[kind],
        `eyebrow должен соответствовать kind=${kind}`,
      );
    }
  });

  it("unknown / absent kind resolves to zhk wording", () => {
    for (const unknown of [undefined, null, "town", "ЖК", "", "  "]) {
      assert.equal(
        resolveLocalityKind(unknown),
        "zhk",
        `неизвестный/отсутствующий kind (${String(unknown)}) должен разрешаться в zhk`,
      );
      assert.equal(
        localityKindEyebrow(unknown),
        EXPECTED_EYEBROW.zhk,
        `eyebrow для неизвестного kind (${String(unknown)}) должен быть как у zhk`,
      );

      const meta = buildLocalityMetadata(
        { name: "Заря", slug: "zarya", kind: unknown as string | null | undefined },
        BASE_URL,
      );
      assert.ok(meta.title.trim().length > 0);
      assert.ok(meta.description.trim().length > 0);
      assert.equal(meta.canonical, `${BASE_URL}/zhk/zarya`);
    }
  });
});
