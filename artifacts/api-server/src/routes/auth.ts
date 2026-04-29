import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyPassword } from "../lib/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  const rawLogin = typeof req.body?.login === "string" ? req.body.login : "";
  const rawPassword = typeof req.body?.password === "string" ? req.body.password : "";
  const login = rawLogin.trim();
  const password = rawPassword.trim();

  if (!login || !password) {
    return res.status(400).json({ error: "Login and password required" });
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.login, login));
  const user = users[0];

  if (!user) {
    return res.status(401).json({ error: "Неверный логин или пароль" });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Неверный логин или пароль" });
  }

  (req.session as any).userId = user.id;

  return res.json({
    user: {
      id: user.id,
      login: user.login,
      name: user.name,
      role: user.role,
      permissions: user.permissions ?? [],
      createdAt: user.createdAt,
    },
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: "Logged out" });
  });
});

router.get("/me", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const user = users[0];
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  return res.json({
    id: user.id,
    login: user.login,
    name: user.name,
    role: user.role,
    permissions: user.permissions ?? [],
    createdAt: user.createdAt,
  });
});

export default router;
