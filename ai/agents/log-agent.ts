/**
 * AI Log Agent v2 — Persistent Error Tracker
 *
 * Reads Railway logs every 5 minutes, filters errors,
 * deduplicates them, persists to errors.json.
 * Never deletes old errors until explicitly cleared.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";
import * as db from "./db";

// ─── Config ───────────────────────────────────────────
const LOG_FILE = path.resolve(__dirname, "../../railway-logs.txt");
const REPORTS_DIR = path.resolve(__dirname, "../reports");
const ERRORS_FILE = path.join(REPORTS_DIR, "errors.json");
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LAST_N_LINES = 1500;

// ─── Types ────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";

interface LogError {
  id: string;
  firstSeen: string; // ISO timestamp
  lastSeen: string;
  level: string;
  source: string;
  message: string;
  count: number;
  severity: Severity;
  sampleLine: number;
}

interface ErrorStore {
  version: number;
  updatedAt: string;
  errors: LogError[];
}

// ─── Severity Keywords ────────────────────────────────

const CRITICAL_KEYWORDS = [
  "unhandledexception",
  "unhandledrejection",
  "process exit",
  "fatal",
  "process crash",
  "cannot connect to database",
  "econnrefused",
  "internal server error",
  "status 500",
  "status 502",
  "status 503",
];

const HIGH_KEYWORDS = [
  "timeout",
  "etimedout",
  "memory leak",
  "heap out of memory",
  "error",
  "failed",
  "status 404",
  "status 429",
];

const MEDIUM_KEYWORDS = ["warn", "deprecated", "slow query"];

const LOW_KEYWORDS = ["info", "notice", "deprecated"];

// ─── Helpers ──────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashMessage(msg: string): string {
  return crypto.createHash("sha256").update(msg).digest("hex").slice(0, 16);
}

function normalizeMessage(line: string): string {
  // Remove timestamps, line numbers, request IDs, hex hashes
  return line
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?/g, "")
    .replace(/\b[0-9a-f]{8,}\b/g, "")
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "")
    .replace(/\border #\d+\b/g, "order #N")
    .replace(/\bmasterId=\d+\b/g, "masterId=N")
    .replace(/\buser_id=\d+\b/g, "user_id=N")
    .trim();
}

function detectSeverity(normalized: string, raw: string): Severity {
  const lower = normalized.toLowerCase();
  if (CRITICAL_KEYWORDS.some((k) => lower.includes(k))) return "critical";
  if (HIGH_KEYWORDS.some((k) => lower.includes(k))) return "high";
  if (MEDIUM_KEYWORDS.some((k) => lower.includes(k))) return "medium";
  if (LOW_KEYWORDS.some((k) => lower.includes(k))) return "low";
  // Stack traces without explicit ERROR are medium
  if (raw.includes("    at ") || raw.includes("Error: ")) return "medium";
  return "low";
}

function detectSource(line: string): string {
  if (line.includes("[master-chat]")) return "master-chat";
  if (line.includes("[dispatcherAI]")) return "dispatcherAI";
  if (line.includes("[maxBot]")) return "maxBot";
  if (line.includes("[cors]")) return "cors";
  if (line.includes("[/api/")) {
    const match = line.match(/(GET|POST|PUT|PATCH|DELETE)\s+\/api\/([^\s]+)/);
    if (match) return `/api/${match[2]}`;
  }
  return "api-server";
}

function detectLevel(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("unhandled")) return "ERROR";
  if (lower.includes("warn")) return "WARN";
  if (lower.includes("fatal")) return "FATAL";
  if (lower.includes("timeout")) return "TIMEOUT";
  return "ERROR";
}

// ─── Log Reading ─────────────────────────────────────

function fetchLogsViaCLI(): string[] {
  try {
    console.log("[LogAgent] Fetching logs via Railway CLI...");
    const output = execSync(
      "railway logs --lines 1500 --service sfera888",
      { encoding: "utf-8", timeout: 30000, env: { ...process.env } }
    );
    return output.split("\n");
  } catch (e: any) {
    console.error("[LogAgent] CLI fetch failed:", e.message);
    return [];
  }
}

function readLogs(): string[] {
  // Prefer local file (development), fallback to Railway CLI (production/Railway deploy)
  if (fs.existsSync(LOG_FILE)) {
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const allLines = content.split("\n");
    return allLines.slice(-LAST_N_LINES);
  }

  console.warn(`[LogAgent] Log file not found locally, trying Railway CLI...`);
  return fetchLogsViaCLI();
}

// ─── Error Filtering ──────────────────────────────────

function isErrorLine(line: string): boolean {
  if (!line.trim()) return false;
  const lower = line.toLowerCase();

  const errorPatterns = [
    "error",
    "warn",
    "fatal",
    "unhandled",
    "timeout",
    "etimedout",
    "econnrefused",
    "failed",
    "cannot",
    "crash",
    "exception",
    "rejection",
    "status 5",
    "heap out of memory",
    "memory leak",
    "deprecated",
    "    at ", // stack trace continuation
    "^error:",
  ];

  // Skip noisy non-error patterns
  const skipPatterns = [
    "[cors] checking origin",
    "[request] get /api/master-chat",
    "[request] get /api/orders",
    "[request] get /api/dispatch/pending",
    "[request] patch /api/master-chat",
    "[master-chat] masterid=",
    "[dispatcherai] proactive skip",
    "[dispatcherai] smart proactive sent",
    "[maxbot] message sent ok",
    "new version available",
  ];

  const shouldSkip = skipPatterns.some((p) => lower.includes(p.toLowerCase()));
  if (shouldSkip) return false;

  return errorPatterns.some((p) => lower.includes(p.toLowerCase()));
}

function filterErrors(lines: string[]): Array<{ line: number; text: string }> {
  const errors: Array<{ line: number; text: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (isErrorLine(lines[i])) {
      errors.push({ line: i + 1, text: lines[i] });
    }
  }
  return errors;
}

// ─── Error Grouping ─────────────────────────────────

function groupErrors(
  entries: Array<{ line: number; text: string }>
): LogError[] {
  const groups = new Map<string, LogError>();

  for (const entry of entries) {
    const normalized = normalizeMessage(entry.text);
    const id = hashMessage(normalized);

    if (groups.has(id)) {
      const existing = groups.get(id)!;
      existing.count += 1;
      existing.lastSeen = new Date().toISOString();
    } else {
      groups.set(id, {
        id,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        level: detectLevel(entry.text),
        source: detectSource(entry.text),
        message: entry.text,
        count: 1,
        severity: detectSeverity(normalized, entry.text),
        sampleLine: entry.line,
      });
    }
  }

  return Array.from(groups.values());
}

// ─── Error Store (Persistence) ────────────────────────

function ensureReportsDir(): void {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function loadErrorStore(): ErrorStore {
  ensureReportsDir();
  if (!fs.existsSync(ERRORS_FILE)) {
    return { version: 1, updatedAt: new Date().toISOString(), errors: [] };
  }

  try {
    const raw = fs.readFileSync(ERRORS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ErrorStore;
    if (!parsed.version || !Array.isArray(parsed.errors)) {
      return { version: 1, updatedAt: new Date().toISOString(), errors: [] };
    }
    return parsed;
  } catch (e) {
    console.warn("[LogAgent] Failed to parse errors.json, resetting");
    return { version: 1, updatedAt: new Date().toISOString(), errors: [] };
  }
}

function saveErrorStore(store: ErrorStore): void {
  ensureReportsDir();
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(ERRORS_FILE, JSON.stringify(store, null, 2));
}

function mergeErrors(
  newErrors: LogError[],
  existing: ErrorStore
): { store: ErrorStore; newlyAdded: LogError[] } {
  const existingMap = new Map(existing.errors.map((e) => [e.id, e]));
  const newlyAdded: LogError[] = [];

  for (const err of newErrors) {
    if (existingMap.has(err.id)) {
      // Update existing
      const ex = existingMap.get(err.id)!;
      ex.count += err.count;
      ex.lastSeen = err.lastSeen;
    } else {
      // New error
      existingMap.set(err.id, err);
      newlyAdded.push(err);
    }
  }

  return {
    store: {
      version: 1,
      updatedAt: new Date().toISOString(),
      errors: Array.from(existingMap.values()),
    },
    newlyAdded,
  };
}

// ─── Printing ───────────────────────────────────────

function printSummary(newlyAdded: LogError[], totalErrors: number): void {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] LogAgent cycle complete`);
  console.log(`  Total persisted errors: ${totalErrors}`);

  if (newlyAdded.length === 0) {
    console.log("  No new errors found.");
    return;
  }

  console.log(`  New errors found: ${newlyAdded.length}`);
  for (const err of newlyAdded) {
    const badge = `[${err.severity.toUpperCase()}]`;
    console.log(
      `    ${badge} [${err.source}] ${err.message.slice(0, 120)}${
        err.message.length > 120 ? "..." : ""
      } (count: ${err.count})`
    );
  }

  // Also print counts by severity
  const bySeverity: Record<string, number> = {};
  for (const err of newlyAdded) {
    bySeverity[err.severity] = (bySeverity[err.severity] || 0) + 1;
  }
  console.log(`  Severity breakdown:`, bySeverity);
}

// ─── Main Loop ────────────────────────────────────────

async function runCycle(): Promise<void> {
  try {
    console.log("[LogAgent] Reading logs...");
    const lines = readLogs();
    if (lines.length === 0) {
      console.log("[LogAgent] No log lines to process.");
      return;
    }

    console.log(`[LogAgent] Read ${lines.length} lines`);
    const errorEntries = filterErrors(lines);
    console.log(`[LogAgent] Found ${errorEntries.length} error-like lines`);

    const newErrors = groupErrors(errorEntries);
    console.log(`[LogAgent] Grouped into ${newErrors.length} unique errors`);

    const store = loadErrorStore();
    const { store: updatedStore, newlyAdded } = mergeErrors(newErrors, store);
    saveErrorStore(updatedStore);

    // Sync new errors to PostgreSQL (if DATABASE_URL is set)
    if (newlyAdded.length > 0) {
      for (const err of newlyAdded) {
        await db.upsertError({
          errorId: err.id,
          firstSeen: err.firstSeen,
          lastSeen: err.lastSeen,
          level: err.level,
          source: err.source,
          message: err.message,
          count: err.count,
          severity: err.severity,
          sampleLine: err.sampleLine,
        });
      }
      console.log(`[DB] Synced ${newlyAdded.length} errors to PostgreSQL.`);
    }

    printSummary(newlyAdded, updatedStore.errors.length);
  } catch (err) {
    console.error("[LogAgent] Cycle failed:", err);
  }
}

async function main(): Promise<void> {
  console.log("========================================");
  console.log("  AI Log Agent v2 — Started");
  console.log(`  Log file: ${LOG_FILE}`);
  console.log(`  Errors file: ${ERRORS_FILE}`);
  console.log(`  Interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log("========================================\n");

  // Ensure PostgreSQL table exists (if DB configured)
  await db.ensureTable();

  // Run first cycle immediately
  await runCycle();

  // Then every N minutes
  while (true) {
    await sleep(POLL_INTERVAL_MS);
    await runCycle();
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[LogAgent] Shutting down gracefully...");
  await db.closePool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[LogAgent] SIGTERM received, exiting...");
  await db.closePool();
  process.exit(0);
});

// Start
main().catch((err) => {
  console.error("[LogAgent] Fatal error:", err);
  process.exit(1);
});
