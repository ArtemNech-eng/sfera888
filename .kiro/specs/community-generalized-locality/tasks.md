# Implementation Plan: Community Generalized Locality (Стадия 2)

## Overview

This plan generalizes the community locality unit from the binary `City → ЖК` model
to a universal `City → Locality` model with a `kind` discriminator
(`zhk | district | settlement`), implemented as a backward-compatible generalization
of the existing `zhk` table. Work proceeds bottom-up: schema + migration first, then
pure domain helpers, then create/resolve logic, routes, feeds/threads, SEO/sitemap,
and finally the Next.js facade. Each step builds on the previous ones and wires into
existing code (`geoService.ts`, `feedService.ts`, `seoContentThreshold.ts`,
`routes/community/*`), leaving no orphaned code.

Language: **TypeScript** (api-server: Express + Drizzle + Postgres; facade: Next.js 15).
Property-based tests use **fast-check** with the existing **Vitest** runner, following
the `artifacts/api-server/__tests__/community/*.property.test.ts` convention. Each
property test is tagged with `// Feature: community-generalized-locality, Property N: ...`
and runs a minimum of 100 iterations (`{ numRuns: 100 }`).

## Tasks

- [x] 1. Data model and migration
  - [x] 1.1 Add `kind` column and Locality types to the schema
    - In `lib/db/src/schema/zhk.ts` add `kind: varchar("kind", { length: 16 }).notNull().default("zhk")` to `zhkTable`
    - Add index `zhk_city_kind_idx` on `(cityId, kind)`
    - Export `type LocalityKind = "zhk" | "district" | "settlement"`, `LOCALITY_KINDS` const tuple, and `DEFAULT_LOCALITY_KIND = "zhk"`
    - _Requirements: 1.2, 1.4, 2.4, 9.1, 9.6_

  - [x] 1.2 Create idempotent `locality-kind` migration
    - Add `artifacts/api-server/migrations/2026-XX-XX-locality-kind.sql` in the baseline-migration style
    - `BEGIN`/`COMMIT` transaction; `ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'zhk'`; safety `UPDATE ... WHERE kind IS NULL`; guarded `DO $$` CHECK constraint `zhk_kind_check`; `CREATE INDEX IF NOT EXISTS zhk_city_kind_idx`
    - _Requirements: 1.5, 2.4, 9.1, 9.2, 9.4, 9.5, 9.6_

  - [x]* 1.3 Write property test for migration data preservation
    - **Property 18: Migration preserves data and defaults to zhk**
    - Run against an ephemeral/transactional Postgres with generated pre-migration datasets; assert slug/name/attributes unchanged, per-City counts unchanged (0 added, 0 removed), and every pre-existing record has `kind = 'zhk'`
    - **Validates: Requirements 3.3, 3.4, 9.1, 9.2**

  - [x]* 1.4 Write property test for migration idempotence
    - **Property 19: Migration idempotence**
    - Apply the migration twice against an ephemeral Postgres; assert the second run succeeds without error and leaves records, kinds, slugs, names, and attributes unchanged
    - **Validates: Requirements 9.3**

  - [x]* 1.5 Write integration test for mid-migration rollback
    - Force a failure on an intermediate migration step against an ephemeral Postgres; assert full rollback (0 deleted, 0 added, 0 modified) and error indication
    - _Requirements: 9.4_

- [x] 2. Locality kind resolution and pure domain helpers
  - [x] 2.1 Implement kind validation and resolution in `geoService.ts`
    - Add `validateLocalityKind(kind: unknown): kind is LocalityKind` and `resolveLocalityKind(kind: unknown): LocalityKind | null` (undefined/null → `"zhk"`, valid → itself, invalid → `null`)
    - _Requirements: 1.3, 1.4, 1.5, 9.6_

  - [x]* 2.2 Write property test for kind resolution
    - **Property 1: Locality kind resolution**
    - Generators: valid set plus invalid strings / `null` / `undefined`; assert resolution rules and that invalid kinds reject without persistence
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 9.6**

  - [x] 2.3 Generalize attribute shaping in `geoService.ts`
    - Add `shapeLocalityAttributes` (generalizing `shapeZhkAttributes`) that includes only `developer`/`completionDate`/`buildings` values that are non-null and non-empty after trimming, omitting empty/null ones
    - _Requirements: 1.7_

  - [x]* 2.4 Write property test for attribute shaping
    - **Property 3: Attribute shaping shows only filled attributes**
    - Generators: mixed empty/whitespace/non-empty attribute values
    - **Validates: Requirements 1.7**

  - [x]* 2.5 Write property test for slug format and global uniqueness
    - **Property 2: Slug format and global uniqueness**
    - Target `slugify` / `generateSlug` in `communitySlug.ts`; assert `^[a-z0-9-]{1,100}$` and pairwise-distinct slugs across combined `cities` + `zhk` namespace over generated Unicode/Cyrillic names
    - **Validates: Requirements 1.6**

- [x] 3. Locality creation and resolution
  - [x] 3.1 Implement `createLocality` and DTO types in `geoService.ts`
    - Add `LocalityView`, `CreateLocalityInput`, `CreateLocalityResult`; implement `createLocality` (name length 2..100 validation, kind resolution, City resolution, dedup by `(cityId, nameNormalized)`, `generateSlug`, insert with `kind`, compute `name_normalized = lower(trim(name))`)
    - Redefine `createZhk` as a thin delegate: `createZhk(input) → createLocality({ ...input, kind: "zhk" })`
    - _Requirements: 1.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3_

  - [x] 3.2 Implement `getLocalityBySlug` and `listLocalitiesByCity` in `geoService.ts`
    - `getLocalityBySlug` returns `LocalityView` with `kind` or `null` for unknown slugs; `listLocalitiesByCity` returns all kinds ordered by `name_normalized asc` without grouping
    - _Requirements: 2.4, 2.5, 3.5_

  - [x]* 3.3 Write property test for create-then-resolve round-trip
    - **Property 4: Create then resolve round-trip**
    - Run against ephemeral Postgres (rollback per iteration); assert synchronous success, returned slug, `name_normalized`, single-City association, immediate resolvability, and available Local_Feed
    - **Validates: Requirements 1.1, 4.2, 4.3, 4.4, 4.8**

  - [x]* 3.4 Write property test for name length boundary
    - **Property 5: Name length validation boundary**
    - Generators: boundary lengths 1/2/100/101, whitespace-only; assert accept iff trimmed length ∈ [2,100], else reject without persistence
    - **Validates: Requirements 4.6**

  - [x]* 3.5 Write property test for city-not-found rejection
    - **Property 6: City-not-found rejection**
    - Generators: citySlugs matching no City; assert rejection with city-not-found and no persisted record
    - **Validates: Requirements 4.7**

  - [x]* 3.6 Write property test for deduplication within a city
    - **Property 7: Deduplication within a city**
    - Generators: mixed-kind localities, submissions whose `lower(trim(name))` equals an existing record's `name_normalized`; assert no new record, existing returned unchanged, comparison scoped to same City and independent of kind
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x]* 3.7 Write property test for city listing order across kinds
    - **Property 9: City listing order across kinds**
    - Assert `listLocalitiesByCity` returns all City localities regardless of kind, ordered by `name_normalized` ascending, without grouping
    - **Validates: Requirements 2.4**

  - [x]* 3.8 Write property test for unknown slug resolution
    - **Property 10: Unknown slug is not found**
    - Assert `getLocalityBySlug` returns not-found and provides no Local_Feed for slugs matching no record
    - **Validates: Requirements 2.5, 3.5**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Route layer wiring (`routes/community/geo.ts`)
  - [x] 5.1 Update geo routes for kind and unified listing
    - `POST /zhk` accepts optional `kind` in body → `createLocality`; map `rejected/invalid_kind` → HTTP 400, `invalid_name` → 400, `city_not_found` → 404, `duplicate_suggested` → 200
    - `GET /zhk/:zhkSlug` returns `locality` with `kind` via `getLocalityBySlug` (404 `{ notFound: true }` on null)
    - `GET /city/:citySlug` returns all localities via `listLocalitiesByCity` (keep existing `zhk` response field for facade compatibility, now containing all kinds)
    - _Requirements: 1.5, 2.4, 2.5, 3.2, 4.2, 4.3, 4.7_

  - [x]* 5.2 Write integration test for concurrent same-name creation
    - Fire two or more concurrent `POST /zhk` with matching `name_normalized` in one City against ephemeral Postgres; assert at most one record created, later requests return the existing record
    - _Requirements: 5.4_

  - [x]* 5.3 Write unit test for create without phone verification
    - Assert `POST /zhk` without completed Phone_Verification is rejected (403 verification_required) and persists no record; missing account id → 401
    - _Requirements: 4.5_

- [x] 6. Feed and thread scoping (`lib/feedService.ts`, `routes/community/feeds.ts`, `threads.ts`)
  - [x] 6.1 Generalize Local_Feed for all kinds in `feedService.ts`
    - Confirm/extend `getLocalFeed(localityId, query)` filters `community_threads` by `zhk_id` and `scope = 'zhk'` identically for every kind; empty feed returns zero threads without error
    - _Requirements: 2.1, 2.2, 2.6, 3.1, 8.2_

  - [x]* 6.2 Write property test for Local_Feed content and ordering
    - **Property 8: Local_Feed content and ordering**
    - Generators: threads with varied `createdAt` including ties (same timestamp, distinct ids); assert feed contains exactly the bound threads ordered by created date desc, tie-broken by id desc, identical logic per kind
    - **Validates: Requirements 2.1, 2.2, 3.1, 8.2**

  - [x]* 6.3 Write property test for empty feed
    - **Property 11: Empty feed for empty locality**
    - Assert a locality with zero bound threads yields an empty feed and no error
    - **Validates: Requirements 2.6**

  - [x] 6.4 Wire thread publish scoping and target validation
    - In `feeds.ts` / `threads.ts` publish paths: local publish stores `scope = 'zhk'`, `zhk_id = locality.id`; city publish stores `scope = 'city'`, `city_id`; reject publish to nonexistent Locality/City without creating a thread, Locality, or City
    - _Requirements: 8.1, 8.3, 8.5_

  - [x]* 6.5 Write property test for thread scoping
    - **Property 16: Thread scoping reuses existing scope mechanism**
    - Assert locality thread → `scope = 'zhk'` bound to locality id; city thread → `scope = 'city'` bound to city id, for any kind
    - **Validates: Requirements 8.1, 8.3**

  - [x]* 6.6 Write property test for publish to nonexistent target
    - **Property 17: Publish to nonexistent target is rejected**
    - Assert publish targeting a nonexistent Locality/City creates nothing and returns a missing-target error
    - **Validates: Requirements 8.5**

  - [x]* 6.7 Write unit test for verification gate and city-feed fallback
    - Assert publish without Phone_Verification is rejected (8.4); Resident can post to City_Feed when no matching locality exists (2.3)
    - _Requirements: 2.3, 8.4_

- [x] 7. SEO threshold and sitemap
  - [x] 7.1 Make `is_indexable` recompute kind-agnostic in `seoContentThreshold.ts`
    - Ensure Content_Threshold evaluation reads/writes `zhk.is_indexable` without branching on `kind`; never-evaluated localities remain `is_indexable = false`; recompute on thread add/remove
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 7.2 Write property test for is_indexable threshold consistency
    - **Property 12: is_indexable threshold consistency**
    - Generators: sequences of thread additions/removals across kinds; assert post-recompute `is_indexable` equals threshold satisfaction, depends only on content not kind, and never-evaluated → false
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

  - [x] 7.3 Make sitemap output flat, ordered, deduplicated in `routes/community/sitemap.ts`
    - In the pure mapper `toCommunitySitemap` and query, emit exactly indexable slugs, no duplicates, single flat list ordered by `slug ASC`; empty list without error when none indexable
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x]* 7.4 Write property test for sitemap indexable slugs
    - **Property 15: Sitemap includes exactly indexable slugs**
    - Generators: locality sets with mixed `is_indexable`; assert output = exactly the `is_indexable = true` slugs, no duplicates, ordered by slug asc, empty when none
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Facade (Next.js 15)
  - [x] 9.1 Build Locality_Page metadata for all kinds (`/zhk/[slug]`)
    - Render Locality_Page for any kind; metadata builder produces non-empty title, non-empty text description, absolute canonical URL from slug; emit `noindex` directive iff `is_indexable = false`
    - _Requirements: 3.2, 6.6, 6.7_

  - [x]* 9.2 Write property test for SEO metadata completeness
    - **Property 13: SEO metadata completeness**
    - Generators: localities of every kind; assert non-empty title, non-empty description, absolute canonical URL matching slug
    - **Validates: Requirements 6.6**

  - [x]* 9.3 Write property test for noindex gating
    - **Property 14: Noindex gating**
    - Assert the page includes a noindex directive iff `is_indexable` is `false`
    - **Validates: Requirements 6.7**

  - [x] 9.4 Add kind selector to Add_Place_Form and unify City_Page listing
    - `Add_Place_Form` exposes a `kind` selector over `{zhk, district, settlement}`; `/goroda/[slug]` renders the unified locality list from `listLocalitiesByCity`
    - _Requirements: 2.4, 4.1_

  - [x]* 9.5 Write unit test for form options and per-kind route rendering
    - Assert Add_Place_Form renders the three kind options (4.1); `/zhk/[slug]` renders for each kind (3.2)
    - _Requirements: 3.2, 4.1_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific granular requirements for traceability.
- Property tests validate the 19 universal correctness properties from the design; each property is its own sub-task placed next to the implementation it validates.
- DB-backed properties (create/dedup/feed/threshold/migration) run against an ephemeral/transactional Postgres with per-iteration rollback; pure-function properties (kind resolution, slug, attribute shaping, sitemap mapping) run in-memory.
- All physical names (`zhk` table, `getZhkBySlug`, `/zhk/[slug]`, `scope = 'zhk'`) stay unchanged for backward compatibility; only semantics are generalized to Locality.
- Checkpoints ensure incremental validation between major layers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.5", "6.1", "7.1", "7.3"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "2.2", "2.3", "6.2", "6.3", "7.2", "7.4"] },
    { "id": 3, "tasks": ["2.4", "3.1", "6.4"] },
    { "id": 4, "tasks": ["3.2", "6.5", "6.6", "6.7"] },
    { "id": 5, "tasks": ["3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "9.4"] },
    { "id": 8, "tasks": ["9.5"] }
  ]
}
```
