/**
 * Pure, kind-aware metadata builder for the community Locality_Page
 * (`/zhk/[slug]`) — Стадия 2 (community-generalized-locality).
 *
 * This module is intentionally **pure** and free of server-only imports
 * (no `next/*`, no `lib/api`, no React) so the Locality_Page metadata property
 * tests (community-generalized-locality, Property 13 & Property 14) can import
 * and exercise it deterministically without dragging in the Next.js request
 * machinery or the marketplace API. The absolute base URL is passed in as an
 * argument rather than read from `lib/env`.
 *
 * Contract encoded here (Requirements 6.6, 6.7):
 *
 *   • Property 13 — *SEO metadata completeness*: for a Locality of ANY kind the
 *     builder produces a NON-EMPTY title, a NON-EMPTY text description, and an
 *     ABSOLUTE canonical URL corresponding to the Locality's slug.
 *
 *   • Property 14 — *Noindex gating*: the builder attaches the `noindex`
 *     directive if and only if the Locality's `isIndexable` is `false`.
 */

import { NOINDEX_ROBOTS } from "./dizajnIndexing";

/**
 * Тип локальной единицы сообщества (Locality_Kind, Requirement 1.2). Держим
 * копию литерального объединения локально, чтобы модуль оставался чистым и не
 * тянул серверные типы.
 */
export type CommunityLocalityKind = "zhk" | "district" | "settlement";

/** `robots`-директива запрета индексации для неиндексируемых локаций. */
export const LOCALITY_NOINDEX_ROBOTS = NOINDEX_ROBOTS;

interface KindWording {
  /** Надзаголовок (eyebrow) над названием на странице. */
  eyebrow: string;
  /** Родительный падеж для заголовка: «соседский чат {…}». */
  titleGenitive: string;
  /** Субъект описания: «Соседское сообщество {…}: …». */
  descriptionSubject: (name: string) => string;
}

/**
 * Формулировки, зависящие от типа локальности (Requirement 6.6). Для каждого
 * `kind` дают непустые, грамматически корректные title/description; ЖК
 * сохраняет прежнюю формулировку ради обратной совместимости.
 */
const KIND_WORDING: Record<CommunityLocalityKind, KindWording> = {
  zhk: {
    eyebrow: "Жилой комплекс",
    titleGenitive: "жилого комплекса",
    descriptionSubject: (name) => `ЖК «${name}»`,
  },
  district: {
    eyebrow: "Район",
    titleGenitive: "района",
    descriptionSubject: (name) => `района «${name}»`,
  },
  settlement: {
    eyebrow: "Посёлок",
    titleGenitive: "посёлка",
    descriptionSubject: (name) => `посёлка «${name}»`,
  },
};

/**
 * Разрешить произвольное значение `kind` в {@link CommunityLocalityKind}.
 * Неизвестные/отсутствующие значения трактуются как `zhk` (Requirement 1.4,
 * 9.6) — страница остаётся корректной для любого входа.
 */
export function resolveLocalityKind(kind: unknown): CommunityLocalityKind {
  return kind === "district" || kind === "settlement" ? kind : "zhk";
}

/** Надзаголовок (eyebrow) страницы, зависящий от типа локальности. */
export function localityKindEyebrow(kind: unknown): string {
  return KIND_WORDING[resolveLocalityKind(kind)].eyebrow;
}

/** Минимальный вход билдера метаданных локации. */
export interface LocalityMetaInput {
  name: string;
  slug: string;
  kind?: string | null;
  /** noindex эмитится iff это значение строго равно `false` (Requirement 6.7). */
  isIndexable?: boolean;
}

/** Плоский результат билдера — маппится на Next `Metadata` в generateMetadata. */
export interface LocalityMetadata {
  title: string;
  description: string;
  /** Абсолютный canonical-URL, соответствующий slug (Requirement 6.6). */
  canonical: string;
  /** Присутствует ТОЛЬКО когда локация неиндексируема (Requirement 6.7). */
  robots?: typeof NOINDEX_ROBOTS;
}

/**
 * Построить метаданные Locality_Page для локации любого `kind`.
 *
 * Гарантии (Requirement 6.6, 6.7):
 *   • `title` и `description` всегда непустые для любого kind;
 *   • `canonical` — абсолютный URL `${baseUrl}/zhk/${slug}`;
 *   • `robots = noindex` присутствует тогда и только тогда, когда
 *     `isIndexable === false`.
 *
 * `baseUrl` передаётся вызывающим (`publicUrl()`), чтобы модуль оставался
 * чистым и тестируемым без серверного окружения.
 */
export function buildLocalityMetadata(
  locality: LocalityMetaInput,
  baseUrl: string,
): LocalityMetadata {
  const wording = KIND_WORDING[resolveLocalityKind(locality.kind)];
  // Непустое имя-фолбэк на случай пустого/пробельного названия — title и
  // description обязаны быть непустыми для любого kind (Requirement 6.6).
  const trimmedName = typeof locality.name === "string" ? locality.name.trim() : "";
  const name = trimmedName.length > 0 ? trimmedName : "Локация";

  const title = `${name} — соседский чат ${wording.titleGenitive}`;
  const description =
    `Соседское сообщество ${wording.descriptionSubject(name)}: аварии ЖКХ, ` +
    "дефекты застройщика, обмен инструментом и локальные рекомендации рядом с домом.";
  const canonical = `${baseUrl.replace(/\/+$/, "")}/zhk/${locality.slug}`;

  const meta: LocalityMetadata = { title, description, canonical };
  if (locality.isIndexable === false) {
    meta.robots = NOINDEX_ROBOTS;
  }
  return meta;
}
