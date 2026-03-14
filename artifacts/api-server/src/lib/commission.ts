import { db, systemSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

export interface CommissionSettings {
  tier1Threshold: number;
  tier1Fixed: number;
  tier2Threshold: number;
  tier2Pct: number;
  tier3Pct: number;
}

export const DEFAULT_COMMISSION: CommissionSettings = {
  tier1Threshold: 50000,
  tier1Fixed: 5000,
  tier2Threshold: 100000,
  tier2Pct: 15,
  tier3Pct: 15,
};

const KEYS = ["commission_tier1_threshold", "commission_tier1_fixed", "commission_tier2_threshold", "commission_tier2_pct", "commission_tier3_pct"] as const;

export async function getCommissionSettings(): Promise<CommissionSettings> {
  const rows = await db.select().from(systemSettingsTable).where(inArray(systemSettingsTable.key, [...KEYS]));
  const map = new Map(rows.map(r => [r.key, r.value]));
  return {
    tier1Threshold: Number(map.get("commission_tier1_threshold") ?? DEFAULT_COMMISSION.tier1Threshold),
    tier1Fixed: Number(map.get("commission_tier1_fixed") ?? DEFAULT_COMMISSION.tier1Fixed),
    tier2Threshold: Number(map.get("commission_tier2_threshold") ?? DEFAULT_COMMISSION.tier2Threshold),
    tier2Pct: Number(map.get("commission_tier2_pct") ?? DEFAULT_COMMISSION.tier2Pct),
    tier3Pct: Number(map.get("commission_tier3_pct") ?? DEFAULT_COMMISSION.tier3Pct),
  };
}

export async function saveCommissionSettings(s: CommissionSettings): Promise<void> {
  const entries: { key: string; value: string }[] = [
    { key: "commission_tier1_threshold", value: String(s.tier1Threshold) },
    { key: "commission_tier1_fixed", value: String(s.tier1Fixed) },
    { key: "commission_tier2_threshold", value: String(s.tier2Threshold) },
    { key: "commission_tier2_pct", value: String(s.tier2Pct) },
    { key: "commission_tier3_pct", value: String(s.tier3Pct) },
  ];
  for (const e of entries) {
    await db.insert(systemSettingsTable).values({ key: e.key, value: e.value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: e.value, updatedAt: new Date() } });
  }
}

export function calculateCommission(orderAmount: number, settings: CommissionSettings = DEFAULT_COMMISSION): number {
  if (orderAmount <= settings.tier1Threshold) return settings.tier1Fixed;
  if (orderAmount <= settings.tier2Threshold) return orderAmount * (settings.tier2Pct / 100);
  return orderAmount * (settings.tier3Pct / 100);
}
