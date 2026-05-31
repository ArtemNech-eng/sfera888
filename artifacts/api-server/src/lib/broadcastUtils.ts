/**
 * Broadcast utilities: concurrency limiter + circuit breaker.
 * Designed to handle 100k+ recipients without blocking or OOM.
 */

// ─── Concurrency limiter ────────────────────────────────────────────────────

export async function runWithConcurrencyLimit<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let idx = 0;
  const errors: Array<{ index: number; error: unknown }> = [];

  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      try {
        await fn(items[i], i);
      } catch (e) {
        errors.push({ index: i, error: e });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  if (errors.length > 0) {
    console.error(`[broadcast] ${errors.length} item(s) failed out of ${items.length}`);
    for (const { index, error } of errors.slice(0, 5)) {
      console.error(`[broadcast]  item[${index}] failed:`, error);
    }
    if (errors.length > 5) {
      console.error(`[broadcast]  ... and ${errors.length - 5} more errors`);
    }
  }
}

// ─── Circuit breaker for external API calls ───────────────────────────────────

interface CircuitState {
  failures: number;
  lastFailure: number;
  openUntil: number;
}

const circuits = new Map<string, CircuitState>();

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 60_000; // 60s cooldown

function getCircuit(name: string): CircuitState {
  if (!circuits.has(name)) {
    circuits.set(name, { failures: 0, lastFailure: 0, openUntil: 0 });
  }
  return circuits.get(name)!;
}

export function isCircuitOpen(name: string): boolean {
  const s = getCircuit(name);
  return Date.now() < s.openUntil;
}

export function recordCircuitSuccess(name: string): void {
  const s = getCircuit(name);
  s.failures = 0;
  s.lastFailure = 0;
}

export function recordCircuitFailure(name: string): void {
  const s = getCircuit(name);
  s.failures++;
  s.lastFailure = Date.now();
  if (s.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    s.openUntil = Date.now() + CIRCUIT_OPEN_MS;
    console.warn(`[circuit] ${name} OPENED for ${CIRCUIT_OPEN_MS}ms after ${s.failures} failures`);
  }
}

// ─── Exponential backoff helper ─────────────────────────────────────────────

export async function withBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxRetries) throw e;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[backoff] retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}
