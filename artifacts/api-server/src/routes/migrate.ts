import { Router } from "express";
import { db, voronkaColumnsTable, mastersTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";

const router = Router();

// One-time migration endpoint — delete after use
// Protected by secret key: ?key=migrate2024secret
router.post("/run", async (req, res) => {
  if (req.query.key !== "migrate2024secret") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const log: string[] = [];

  try {
    // ── Step 1: Update existing "Свободные" (id=1) → "Свободен", position=2
    await db.update(voronkaColumnsTable)
      .set({ name: "Свободен", position: 2 })
      .where(eq(voronkaColumnsTable.id, 1));
    log.push("Updated column id=1: Свободные → Свободен, position=2");

    // ── Step 2: Insert missing columns
    const novye = await db.insert(voronkaColumnsTable).values({
      name: "Новые", position: 1, receivesOrders: false, color: "blue",
    }).returning();
    log.push(`Created column 'Новые', id=${novye[0].id}`);

    const naObyekte = await db.insert(voronkaColumnsTable).values({
      name: "На объекте", position: 3, receivesOrders: false, color: "orange",
    }).returning();
    log.push(`Created column 'На объекте', id=${naObyekte[0].id}`);

    const ozhidaet = await db.insert(voronkaColumnsTable).values({
      name: "Ожидает оплаты", position: 4, receivesOrders: false, color: "red",
    }).returning();
    log.push(`Created column 'Ожидает оплаты', id=${ozhidaet[0].id}`);

    const colNovye = novye[0].id;       // Новые
    const colSvobodenProd = 1;           // Свободен (existing)
    const colNaObyekte = naObyekte[0].id; // На объекте
    // ozhidaet[0].id — Ожидает оплаты (not used by current dev masters)

    // Dev column → prod column mapping
    // dev col 1 (Новые) → colNovye
    // dev col 2 (Свободен) → colSvobodenProd (1)
    // dev col 3 (На объекте) → colNaObyekte
    // dev col 5 (Ожидает оплаты) → ozhidaet[0].id

    const devColMap: Record<number, number> = {
      1: colNovye,
      2: colSvobodenProd,
      3: colNaObyekte,
      5: ozhidaet[0].id,
    };

    // ── Step 3: Assign existing Артём (id=4) to Свободен column
    await db.update(mastersTable)
      .set({ voronkaColumnId: colSvobodenProd })
      .where(eq(mastersTable.id, 4));
    log.push("Assigned Артём (id=4) to Свободен column");

    // ── Step 4: Insert dev masters (as test masters)
    const devMasters = [
      {
        alias: "Краснодар",
        city: "Краснодар",
        phone: "89892860863",
        telegramId: "7260307561",
        status: "active" as const,
        specialization: "Монтаж ламината, Поклейка обоев, Покраска стен",
        specializations: ["Монтаж ламината", "Поклейка обоев", "Покраска стен"],
        tags: [],
        rating: "3.00",
        totalOrders: 1,
        acceptedOrders: 1,
        debt: "0.00",
        voronkaColumnId: devColMap[3], // На объекте
        isTestMaster: true,
        pwaLogin: "admin",
        pwaPasswordHash: "$2b$10$Lkui5Rq8ZZBmn9x0MsSlZe6oOshgUjnKhbgmoVTcLCbo1WYyRyd5C",
        customAvatarUrl: "/api/tg-file/AgACAgIAAxUAAWm05WX6dS6C7BbDBglfAAGOaEnvCwACYO8xG9QkiEsu5isoSWqAngEAAwIAA2MAAzoE",
      },
      {
        alias: "Евгений Белоус",
        city: "Краснодар",
        phone: "+79184207679",
        telegramId: "330645502",
        status: "active" as const,
        specialization: "Поклейка обоев, Монтаж ламината, Покраска стен, Штукатурка стен, Комплексный ремонт",
        specializations: ["Поклейка обоев", "Монтаж ламината", "Покраска стен", "Штукатурка стен", "Комплексный ремонт"],
        tags: [],
        rating: "3.00",
        totalOrders: 0,
        acceptedOrders: 0,
        debt: "0.00",
        voronkaColumnId: devColMap[2], // Свободен
        isTestMaster: true,
      },
      {
        alias: "Александр",
        city: "Краснодар",
        phone: "+79530892393",
        telegramId: "5903117133",
        status: "active" as const,
        specialization: "Поклейка обоев, Монтаж ламината, Покраска стен, Штукатурка стен",
        specializations: ["Поклейка обоев", "Монтаж ламината", "Покраска стен", "Штукатурка стен"],
        tags: [],
        rating: "3.00",
        totalOrders: 0,
        acceptedOrders: 0,
        debt: "0.00",
        voronkaColumnId: devColMap[1], // Новые
        isTestMaster: true,
      },
      {
        alias: "Геннадий",
        city: "Краснодар",
        phone: "89282858426",
        telegramId: "1879917284",
        status: "active" as const,
        specialization: "Укладка плитки, Покраска стен, Штукатурка стен, Монтаж ламината",
        specializations: ["Укладка плитки", "Покраска стен", "Штукатурка стен", "Монтаж ламината"],
        tags: [],
        rating: "3.00",
        totalOrders: 0,
        acceptedOrders: 0,
        debt: "0.00",
        voronkaColumnId: devColMap[2], // Свободен
        isTestMaster: true,
        customAvatarUrl: "/api/tg-file/AgACAgIAAxUAAWm378TJDYILa62iR3z8NJgrGGg-AAJX4DEbReNYSvJqH-JvwcmvAQADAgADYwADOgQ",
      },
      {
        alias: "Тест Мастер",
        city: "Москва",
        phone: "+7 999 000-00-00",
        telegramId: null,
        status: "active" as const,
        specialization: "Ремонт бытовой техники",
        specializations: ["Ремонт бытовой техники"],
        tags: [],
        rating: "3.00",
        totalOrders: 0,
        acceptedOrders: 0,
        debt: "0.00",
        voronkaColumnId: devColMap[1], // Новые
        isTestMaster: true,
        pwaLogin: "mastertest1",
        pwaPasswordHash: "$2b$10$GmxsHMBY9Qoc86TrHUTFluoOhafzkMsn5s/mhHfvVEKOxuEuj/vwC",
      },
    ];

    for (const m of devMasters) {
      const inserted = await db.insert(mastersTable).values({
        alias: m.alias,
        city: m.city,
        phone: m.phone ?? null,
        telegramId: m.telegramId ?? null,
        status: m.status,
        specialization: m.specialization,
        specializations: m.specializations,
        tags: m.tags,
        rating: m.rating as any,
        totalOrders: m.totalOrders,
        acceptedOrders: m.acceptedOrders,
        debt: m.debt as any,
        voronkaColumnId: m.voronkaColumnId ?? null,
        isTestMaster: m.isTestMaster,
        pwaLogin: (m as any).pwaLogin ?? null,
        pwaPasswordHash: (m as any).pwaPasswordHash ?? null,
        customAvatarUrl: (m as any).customAvatarUrl ?? null,
      }).returning();
      log.push(`Inserted master '${m.alias}', id=${inserted[0].id}`);
    }

    log.push("✅ Migration complete!");
    res.json({ success: true, log });
  } catch (err: any) {
    log.push(`❌ Error: ${err.message}`);
    res.status(500).json({ success: false, log, error: err.message });
  }
});

export default router;
