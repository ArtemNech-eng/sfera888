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
      
      const errorId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`[ErrorLogger] Inserting error ${errorId}...`);
      
      await db.insert(aiErrorLogs).values({
        errorId,
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
      
      console.log(`[ErrorLogger] Successfully saved error ${errorId}`);
    } catch (dbErr: any) {
      console.error("[ErrorLogger] Failed to save error:", dbErr.message || dbErr);
      console.error("[ErrorLogger] DB Error stack:", dbErr.stack || 'no stack');
    }
    
    next(err);
  };
}
