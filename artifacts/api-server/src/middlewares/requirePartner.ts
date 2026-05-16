import { Request, Response, NextFunction } from "express";
import { db, usersTable, trafficPartnersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requirePartner(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any).userId;
  if (!userId) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    return res.status(401).json({ error: "user_not_found" });
  }
  if (user.role !== "partner") {
    return res.status(403).json({ error: "access_denied", message: "Только для партнёров" });
  }

  const [partner] = await db
    .select()
    .from(trafficPartnersTable)
    .where(eq(trafficPartnersTable.userId, userId));

  if (!partner) {
    return res.status(403).json({ error: "partner_not_found", message: "Профиль партнёра не найден" });
  }

  if (partner.status === "blocked") {
    return res.status(403).json({ error: "partner_blocked", message: "Аккаунт заблокирован" });
  }
  if (partner.status === "archived") {
    return res.status(403).json({ error: "partner_archived", message: "Аккаунт архивирован" });
  }

  (req as any).user = user;
  (req as any).partner = partner;
  next();
}
