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
      console.log(`[requireRole] 401 for ${req.method} ${req.path}: no session userId`);
      return res.status(401).json({ error: "Not authenticated" });
    }
    const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const user = users[0];
    if (!user) {
      console.log(`[requireRole] 401 for ${req.method} ${req.path}: user ${userId} not found`);
      return res.status(401).json({ error: "User not found" });
    }
    const allowed = roles.includes(user.role);
    console.log(`[requireRole] ${req.method} ${req.path}: user=${user.id} role=${user.role} allowed=${allowed} roles=[${roles.join(",")}]`);
    if (!allowed) {
      return res.status(403).json({ error: "Access denied" });
    }
    (req as any).user = user;
    next();
  };
}

export function requirePermission(perm: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req.session as any).userId;
    if (!userId) {
      console.log(`[requirePermission] 401 for ${req.method} ${req.path}: no session userId`);
      return res.status(401).json({ error: "Not authenticated" });
    }
    const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const user = users[0];
    if (!user) {
      console.log(`[requirePermission] 401 for ${req.method} ${req.path}: user ${userId} not found`);
      return res.status(401).json({ error: "User not found" });
    }
    if (user.role === "admin") {
      console.log(`[requirePermission] ${req.method} ${req.path}: user=${user.id} role=admin allowed=true (admin bypass)`);
      (req as any).user = user;
      return next();
    }
    const perms = (user.permissions as string[]) ?? [];
    const allowed = perms.includes(perm);
    console.log(`[requirePermission] ${req.method} ${req.path}: user=${user.id} role=${user.role} perm=${perm} perms=[${perms.join(",")}] allowed=${allowed}`);
    if (!allowed) {
      return res.status(403).json({ error: "Access denied" });
    }
    (req as any).user = user;
    next();
  };
}
