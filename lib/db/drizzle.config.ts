import { defineConfig } from "drizzle-kit";

// DATABASE_URL is only required for `drizzle-kit push`/`pull`.
// `drizzle-kit generate` works offline from the schema files alone,
// so we fall back to a placeholder when it's not set.
const url = process.env.DATABASE_URL ?? "postgres://localhost/_offline_generate";

export default defineConfig({
  schema: "./src/schema/*",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  // Single-statement SQL files keep migrate() simple and predictable.
  breakpoints: false,
});
