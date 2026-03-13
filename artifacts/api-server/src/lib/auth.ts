import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function calculateCommission(orderAmount: number): number {
  if (orderAmount <= 50000) return 5000;
  if (orderAmount <= 100000) return orderAmount * 0.15;
  return orderAmount * 0.15; // Manual for >100k (default 15%)
}
