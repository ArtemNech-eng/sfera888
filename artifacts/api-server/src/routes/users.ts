import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth.js";
import { requireRole } from "../middlewares/requireAuth.js";

const router = Router();

// Список операторов для выбора в задачах и других формах (доступно всем залогиненным)
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
    id: usersTable.id,
    login: usersTable.login,
    name: usersTable.name,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
  }).from(usersTable);
  res.json(users);
});

router.post("/", requireRole("admin"), async (req, res) => {
  const { login, password, name, role } = req.body;
  if (!login || !password || !name || !role) {
    return res.status(400).json({ error: "All fields required" });
  }
  const passwordHash = await hashPassword(password);
  const result = await db.insert(usersTable).values({ login, passwordHash, name, role }).returning();
  const user = result[0];
  return res.status(201).json({
    id: user.id,
    login: user.login,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  });
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true, message: "User deleted" });
});

export default router;
