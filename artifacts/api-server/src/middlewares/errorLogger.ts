import { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import fs from "fs";

const ERROR_LOG_FILE = "/app/error-logs.json";

export function errorLoggerMiddleware() {
  return async (err: any, req: Request, res: Response, next: NextFunction) => {
    try {
      const message = err?.message || String(err);
      const stack = err?.stack || "";
      const path = req.path;
      const method = req.method;
      
      console.error(`[ErrorLogger] ${method} ${path}: ${message}`);
      
      const errorId = Math.random().toString(36).substring(2, 10);
      const errorData = {
        errorId,
        message: `[${method} ${path}] ${message}`,
        severity: "ERROR",
        source: "api-server",
        level: "ERROR",
        count: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        isActive: true,
      };
      
      // Try PostgreSQL first
      if (pool) {
        try {
          await pool.query(
            `INSERT INTO ai_error_logs (error_id, first_seen, last_seen, level, source, message, count, severity, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [errorData.errorId, errorData.firstSeen, errorData.lastSeen, errorData.level, errorData.source, errorData.message, errorData.count, errorData.severity, errorData.isActive]
          );
          console.log(`[ErrorLogger] Saved to PostgreSQL: ${errorId}`);
        } catch (pgErr: any) {
          console.error("[ErrorLogger] PostgreSQL failed:", pgErr.message);
          // Fallback to file
          throw pgErr;
        }
      }
    } catch (dbErr: any) {
      // Fallback: write to file
      console.error("[ErrorLogger] Fallback to file:", dbErr.message);
      try {
        let logs: any[] = [];
        if (fs.existsSync(ERROR_LOG_FILE)) {
          logs = JSON.parse(fs.readFileSync(ERROR_LOG_FILE, "utf-8"));
        }
        logs.push({
          errorId: Math.random().toString(36).substring(2, 10),
          message: `[${req.method} ${req.path}] ${err?.message || String(err)}`,
          severity: "ERROR",
          source: "api-server",
          level: "ERROR",
          count: 1,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          isActive: true,
        });
        fs.writeFileSync(ERROR_LOG_FILE, JSON.stringify(logs, null, 2));
        console.log("[ErrorLogger] Saved to file fallback");
      } catch (fileErr) {
        console.error("[ErrorLogger] File fallback also failed:", fileErr);
      }
    }
    
    next(err);
  };
}
