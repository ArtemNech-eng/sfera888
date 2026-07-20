import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

// Zen-палитра (совпадает с globals.css: --z-accent / --z-bg / текст).
const COLORS = {
  bg: "#F6F7F8",
  ink: "#141414",
  muted: "#6B7280",
  accent: "#FF5A3C",
  green: { fg: "#0a7d56", bg: "#e7f6ee" },
  yellow: { fg: "#b4600a", bg: "#fff4e6" },
  red: { fg: "#b42318", bg: "#fef2f2" },
  gray: { fg: "#6b7280", bg: "#eef0f2" },
};

// Шрифты грузим один раз (subset DejaVu — кириллица+латиница+цифры+₽, ~20 КБ).
let fontsPromise: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> | null = null;
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      fetch(new URL("./_fonts/DejaVuSans-subset.ttf", import.meta.url)).then((r) => r.arrayBuffer()),
      fetch(new URL("./_fonts/DejaVuSans-Bold-subset.ttf", import.meta.url)).then((r) => r.arrayBuffer()),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return fontsPromise;
}

function toInt(v: string | null): number {
  const n = parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 0;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/**
 * Динамическая OG-картинка результата проверятора смет (Real Price, Req 7.2).
 * Читает счётчики вердиктов из query (?city=&g=&y=&r=&u=) и рисует карточку-
 * «светофор» для превью в мессенджерах. Кириллица — встроенным subset-шрифтом,
 * без внешних зависимостей на рантайме.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const city = (sp.get("city") ?? "").trim().slice(0, 40) || "вашем городе";
  const g = toInt(sp.get("g"));
  const y = toInt(sp.get("y"));
  const r = toInt(sp.get("r"));
  const u = toInt(sp.get("u"));
  const checked = g + y + r + u;

  const fonts = await loadFonts();

  const stats: Array<{ n: number; label: string; c: { fg: string; bg: string } }> = [
    { n: g, label: "по рынку", c: COLORS.green },
    { n: y, label: "выше рынка", c: COLORS.yellow },
    { n: r, label: "завышено", c: COLORS.red },
  ];
  if (u > 0) stats.push({ n: u, label: "нет данных", c: COLORS.gray });

  const posWord = plural(checked, "позицию", "позиции", "позиций");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: COLORS.bg,
          padding: "64px 72px",
          fontFamily: "DejaVu",
        }}
      >
        {/* Шапка бренда */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: COLORS.accent,
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            Ч
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.ink }}>Честные мастера</span>
            <span style={{ fontSize: 16, color: COLORS.muted }}>Проверка сметы · бесплатно</span>
          </div>
        </div>

        {/* Заголовок */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
          <span style={{ fontSize: 30, color: COLORS.muted }}>
            Проверил {checked} {posWord} сметы в {city}
          </span>
          <span style={{ fontSize: 62, fontWeight: 700, color: COLORS.ink, lineHeight: 1.1, marginTop: 8 }}>
            Не завышена ли цена на ремонт?
          </span>
        </div>

        {/* Вердикты-«светофор» */}
        <div style={{ display: "flex", gap: 20 }}>
          {stats.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                background: s.c.bg,
                borderRadius: 20,
                padding: "22px 28px",
                minWidth: 190,
              }}
            >
              <span style={{ fontSize: 64, fontWeight: 700, color: s.c.fg }}>{s.n}</span>
              <span style={{ fontSize: 24, color: s.c.fg }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Подвал */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 22, color: COLORS.ink, fontWeight: 700 }}>chestnye-mastera.ru</span>
          <span style={{ fontSize: 20, color: COLORS.muted }}>
            Реальные цены подтверждённых сделок
          </span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      // Детерминировано по query → агрессивно кэшируем на CDN и в мессенджерах.
      headers: { "cache-control": "public, max-age=86400, s-maxage=86400, immutable" },
      fonts: [
        { name: "DejaVu", data: fonts.regular, weight: 400, style: "normal" },
        { name: "DejaVu", data: fonts.bold, weight: 700, style: "normal" },
      ],
    },
  );
}
