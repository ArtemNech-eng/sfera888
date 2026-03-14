import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || "crm-secret-key-2024",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// Serve uploaded avatars as static files (path must start with /api since Replit routes /api/* here)
app.use("/api/uploads", express.static(path.join(__dirname, "../../public/uploads")));
// Serve banner images
app.use("/api/banners", express.static(path.join(__dirname, "../public/banners")));

app.use("/api", router);

export default app;
