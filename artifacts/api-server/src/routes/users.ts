import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth.js";
import { requireRole } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/operators", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });
  const users = await db.select({
    id:    usersTable.id,
    login: usersTable.login,
    name:  usersTable.name,
    role:  usersTable.role,
  }).from(usersTable);
  res.json(users);
});

router.get("/", requireRole("admin"), async (req, res) => {
  const users = await db.select({
    id:          usersTable.id,
    login:       usersTable.login,
    name:        usersTable.name,
    role:        usersTable.role,
    permissions: usersTable.permissions,
    createdAt:   usersTable.createdAt,
  }).from(usersTable);
  res.json(users);
});

router.post("/", requireRole("admin"), async (req, res) => {
  const { login, password, name, role, permissions } = req.body;
  if (!login || !password || !name || !role) {
    return res.status(400).json({ error: "All fields required" });
  }
  const passwordHash = await hashPassword(password);
  const perms: string[] = Array.isArray(permissions) ? permissions : [];
  const result = await db.insert(usersTable).values({ login, passwordHash, name, role, permissions: perms }).returning();
  const user = result[0];
  return res.status(201).json({
    id:          user.id,
    login:       user.login,
    name:        user.name,
    role:        user.role,
    permissions: user.permissions ?? [],
    createdAt:   user.createdAt,
  });
});

router.patch("/:id/permissions", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { permissions } = req.body;
  if (!Array.isArray(permissions)) return res.status(400).json({ error: "permissions must be array" });
  await db.update(usersTable).set({ permissions }).where(eq(usersTable.id, id));
  res.json({ success: true });
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true, message: "User deleted" });
});

router.patch("/:id/password", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) return res.status(401).json({ error: "Unauthorized" });

  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid id" });

  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser) return res.status(401).json({ error: "Unauthorized" });

  if (sessionUser.role !== "admin" && sessionUser.id !== targetId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Пароль должен содержать минимум 6 символов" });
  }

  const passwordHash = await hashPassword(password);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, targetId));
  res.json({ success: true });
});

export default router;
