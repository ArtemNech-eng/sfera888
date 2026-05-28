import { Request, Response, NextFunction } from "express";

/**
 * Middleware that ensures the request is authenticated as a master.
 * Reads masterId from the session.
 */
export function requireMasterAuth(req: Request, res: Response, next: NextFunction) {
  const masterId = (req.session as any).masterId as number | undefined;
  if (!masterId) {
    return res.status(401).json({ error: "Не авторизован" });
  }
  next();
}
