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
      
      const errorId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(-8);
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
      });
      
      console.log(`[ErrorLogger] Successfully saved error ${errorId}`);
    } catch (dbErr: any) {
      console.error("[ErrorLogger] Failed to save error:", dbErr.message || dbErr);
      console.error("[ErrorLogger] DB Error code:", dbErr.code);
      console.error("[ErrorLogger] DB Error detail:", dbErr.detail);
      console.error("[ErrorLogger] DB Error table:", dbErr.table);
      console.error("[ErrorLogger] DB Error constraint:", dbErr.constraint);
      console.error("[ErrorLogger] DB Error stack:", dbErr.stack || 'no stack');
    }
    
    next(err);
  };
}
