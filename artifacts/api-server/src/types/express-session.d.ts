import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    masterId?: number;
    user?: {
      id?: number;
      login?: string;
      name?: string;
      role?: string;
    };
  }
}
