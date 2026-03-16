import { Router } from "express";
import { db, masterReviewsTable, mastersTable, ordersTable } from "@workspace/db";
import { eq, desc, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import OpenAI from "openai";

const router = Router();
const opsAndAdmin = requireRole("admin", "master_operator", "lead_operator");

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// ─── GET /api/master-reviews/:masterId ────────────────────────────────────────

router.get("/:masterId", requireAuth, async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid masterId" });

  const reviews = await db
    .select()
    .from(masterReviewsTable)
    .where(eq(masterReviewsTable.masterId, masterId))
    .orderBy(desc(masterReviewsTable.createdAt));

  res.json(reviews);
});

// ─── POST /api/master-reviews ─────────────────────────────────────────────────

router.post("/", opsAndAdmin, async (req: any, res) => {
  const { masterId, orderId, sentiment, text } = req.body;
  if (!masterId || !text?.trim()) {
    return res.status(400).json({ error: "masterId и text обязательны" });
  }
  if (!["positive", "negative", "neutral"].includes(sentiment)) {
    return res.status(400).json({ error: "sentiment: positive | negative | neutral" });
  }

  const createdBy = req.user?.username ?? req.user?.name ?? "Оператор";

  const [review] = await db.insert(masterReviewsTable).values({
    masterId,
    orderId: orderId ?? null,
    sentiment,
    text: text.trim(),
    createdBy,
  }).returning();

  res.json(review);
});

// ─── DELETE /api/master-reviews/:id ──────────────────────────────────────────

router.delete("/:id", opsAndAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  await db.delete(masterReviewsTable).where(eq(masterReviewsTable.id, id));
  res.json({ success: true });
});

// ─── GET /api/master-reviews/:masterId/ai-recommendation ─────────────────────

router.get("/:masterId/ai-recommendation", opsAndAdmin, async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid masterId" });

  // Fetch master info and reviews
  const [masterRows, reviews, activeOrders] = await Promise.all([
    db.select().from(mastersTable).where(eq(mastersTable.id, masterId)),
    db.select().from(masterReviewsTable)
      .where(eq(masterReviewsTable.masterId, masterId))
      .orderBy(desc(masterReviewsTable.createdAt)),
    db.select({ serviceType: ordersTable.serviceType })
      .from(ordersTable)
      .where(eq(ordersTable.masterId, masterId))
      .orderBy(desc(ordersTable.createdAt))
      .limit(20),
  ]);

  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found" });

  if (reviews.length === 0) {
    return res.json({ recommendation: "Комментариев пока нет — недостаточно данных для рекомендации. Добавьте первые отзывы после выполненных заказов." });
  }

  const positiveCount = reviews.filter(r => r.sentiment === "positive").length;
  const negativeCount = reviews.filter(r => r.sentiment === "negative").length;

  const reviewsText = reviews.map(r => {
    const emoji = r.sentiment === "positive" ? "✅" : r.sentiment === "negative" ? "❌" : "➡️";
    const date = new Date(r.createdAt).toLocaleDateString("ru-RU");
    return `${emoji} [${date}] ${r.text}`;
  }).join("\n");

  const prompt = `Ты помощник оператора CRM-системы для управления мастерами по ремонту.

Мастер: ${master.alias}
Город: ${master.city}
Специальности: ${master.specializations?.join(", ") || master.specialization || "не указаны"}
Всего заказов: ${master.totalOrders}
Рейтинг: ${Number(master.rating).toFixed(1)}/5
Положительных комментариев: ${positiveCount}
Отрицательных комментариев: ${negativeCount}

Комментарии операторов (от новых к старым):
${reviewsText}

На основе этих данных дай короткую рекомендацию оператору — стоит ли передавать этому мастеру новый заказ и на что обратить внимание. Будь конкретным и практичным. Максимум 3-4 предложения.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
  });

  const recommendation = completion.choices[0]?.message?.content?.trim() ?? "Не удалось получить рекомендацию.";
  res.json({ recommendation, positiveCount, negativeCount, totalReviews: reviews.length });
});

export default router;
