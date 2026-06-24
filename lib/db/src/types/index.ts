/**
 * Публичная поверхность чистых TypeScript-типов из `@workspace/db`.
 *
 * Сюда выносятся типы, которые нужны и Drizzle-схеме, и api-server, и
 * marketplace — без какой-либо зависимости от этих пакетов, чтобы избежать
 * циркулярных импортов (см. `.kiro/specs/ai-design-product/tasks.md`,
 * задача 1.3).
 */
export * from "./layout";
export * from "./furniture";
