import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { UPLOAD_BASE } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const PgSession = connectPgSimple(session);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(session({
  store: new PgSession({
    pool: pgPool,
    createTableIfMissing: true,
    tableName: "user_sessions",
  }),
  secret: process.env.SESSION_SECRET || "crm-secret-key-2024",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// Serve uploaded avatars as static files (path must start with /api since Replit routes /api/* here)
app.use("/api/uploads", express.static(UPLOAD_BASE));
// Serve banner images
app.use("/api/banners", express.static(path.join(__dirname, "../public/banners")));

app.use("/api", router);

// ── Serve CRM and master-pwa as static files (production deployment) ─────────
// In development these are served by their own Vite dev servers via path routing.
// In production (deployed VM) the api-server is the only process, so it serves
// the pre-built static files for both frontends.

const crmDistPath = path.join(__dirname, "../../crm/dist/public");
const pwaDistPath = path.join(__dirname, "../../master-pwa/dist/public");

if (fs.existsSync(crmDistPath)) {
  app.use("/crm", express.static(crmDistPath));
  app.use("/crm", (_req, res) => {
    res.sendFile(path.join(crmDistPath, "index.html"));
  });
}

if (fs.existsSync(pwaDistPath)) {
  app.use("/master-pwa", express.static(pwaDistPath));
  app.use("/master-pwa", (_req, res) => {
    res.sendFile(path.join(pwaDistPath, "index.html"));
  });
}

// Root redirect: / → Master PWA (PWA is the default app for the custom domain)
app.get("/", (_req, res) => {
  res.redirect(301, "/master-pwa/");
});

export default app;
