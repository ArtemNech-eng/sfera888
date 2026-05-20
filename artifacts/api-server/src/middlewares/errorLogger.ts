import { Request, Response, NextFunction } from "express";
import { db, aiErrorLogs } from "@workspace/db";
import { sql } from "drizzle-orm";

export function errorLoggerMiddleware() {
  return async (err: any, req: Request, res: Response, next: NextFunction) => {
    try {
      const message = err?.message || String(err);
      const stack = err?.stack || "";
      const path = req.path;
      const method = req.method;
      
      console.error(`[ErrorLogger] ${method} ${path}: ${message}`);
      
      await db.insert(aiErrorLogs).values({
        errorId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        message: `[${method} ${path}] ${message}`,
        severity: "ERROR",
        source: "api-server",
        level: "ERROR",
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
      }).onConflictDoUpdate({
        target: aiErrorLogs.errorId,
        set: {
          lastSeen: new Date(),
          count: sql`${aiErrorLogs.count} + 1`,
          isActive: true,
        },
      });
    } catch (dbErr) {
      console.error("[ErrorLogger] Failed to save error:", dbErr);
    }
    
    next(err);
  };
}
