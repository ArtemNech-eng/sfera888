/**
 * check-errors.ts — Manual error checker
 *
 * Run: pnpm check
 * Outputs a formatted summary of all persisted errors from errors.json
 */

import * as fs from "fs";
import * as path from "path";

const ERRORS_FILE = path.resolve(__dirname, "../reports/errors.json");

interface LogError {
  id: string;
  firstSeen: string;
  lastSeen: string;
  level: string;
  source: string;
  message: string;
  count: number;
  severity: "critical" | "high" | "medium" | "low";
  sampleLine: number;
}

function loadErrors(): LogError[] {
  if (!fs.existsSync(ERRORS_FILE)) {
    console.log("No errors.json found. Run 'pnpm start' first.");
    return [];
  }
  try {
    const raw = fs.readFileSync(ERRORS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.errors || [];
  } catch (e) {
    console.error("Failed to read errors.json:", e);
    return [];
  }
}

function formatSeverity(s: string): string {
  const map: Record<string, string> = {
    critical: "\x1b[31mCRITICAL\x1b[0m",
    high: "\x1b[33mHIGH    \x1b[0m",
    medium: "\x1b[36mMEDIUM  \x1b[0m",
    low: "\x1b[32mLOW     \x1b[0m",
  };
  return map[s] || s.toUpperCase();
}

function main(): void {
  const errors = loadErrors();

  if (errors.length === 0) {
    console.log("✅ No errors recorded.");
    return;
  }

  // Sort by severity then by lastSeen
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  errors.sort((a, b) => {
    const sevDiff =
      (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
  });

  console.log(`\n📊 Total errors: ${errors.length}\n`);

  for (const err of errors) {
    console.log(`${formatSeverity(err.severity)} | ${err.source}`);
    console.log(`   First: ${err.firstSeen}`);
    console.log(`   Last:  ${err.lastSeen}`);
    console.log(`   Count: ${err.count}`);
    console.log(`   ${err.message.slice(0, 200)}`);
    console.log("");
  }

  // Summary by severity
  const bySev: Record<string, number> = {};
  for (const e of errors) {
    bySev[e.severity] = (bySev[e.severity] || 0) + 1;
  }
  console.log("Summary:", bySev);
}

main();
