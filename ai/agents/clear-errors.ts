/**
 * clear-errors.ts — Clear all persisted errors
 *
 * Run: npx ts-node agents/clear-errors.ts
 * Or:  pnpm exec ts-node agents/clear-errors.ts
 */

import * as fs from "fs";
import * as path from "path";

const ERRORS_FILE = path.resolve(__dirname, "../reports/errors.json");

function main(): void {
  const store = {
    version: 1,
    updatedAt: new Date().toISOString(),
    errors: [] as unknown[],
  };

  fs.writeFileSync(ERRORS_FILE, JSON.stringify(store, null, 2));
  console.log("✅ All errors cleared from errors.json");
}

main();
