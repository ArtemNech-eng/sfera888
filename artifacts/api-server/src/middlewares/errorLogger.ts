import { Request, Response, NextFunction } from "express";
import { db, aiErrorLogsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export function errorLoggerMiddleware() {
  return async (err: any, req: Request, res: Response, next: NextFunction) => {
    try {
      const message = err?.message || String(err);
      const stack = err?.stack || "";
      const path = req.path;
      const method = req.method;
      
      console.error(`[ErrorLogger] ${method} ${path}: ${message}`);
      
      await db.insert(aiErrorLogsTable).values({
        errorMessage: `[${method} ${path}] ${message}`,
        severity: "ERROR",
        source: "api-server",
        stackTrace: stack.substring(0, 2000),
        isActive: true,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        count: 1,
      }).onConflictDoUpdate({
        target: aiErrorLogsTable.errorMessage,
        set: {
          lastSeenAt: new Date(),
          count: sql`${aiErrorLogsTable.count} + 1`,
          isActive: true,
        },
      });
    } catch (dbErr) {
      console.error("[ErrorLogger] Failed to save error:", dbErr);
    }
    
    next(err);
  };
}
