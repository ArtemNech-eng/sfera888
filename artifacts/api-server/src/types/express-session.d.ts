import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    masterId?: number;
    /** Идентификатор аутентифицированного Community_Account (сообщество «ХочуТакже»). */
    communityAccountId?: number;
    user?: {
      id?: number;
      login?: string;
      name?: string;
      role?: string;
    };
  }
}
