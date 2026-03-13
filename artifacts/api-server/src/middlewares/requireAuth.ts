import { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any).userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!users[0]) {
    return res.status(401).json({ error: "User not found" });
  }
  (req as any).user = users[0];
  next();
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req.session as any).userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const user = users[0];
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    (req as any).user = user;
    next();
  };
}
