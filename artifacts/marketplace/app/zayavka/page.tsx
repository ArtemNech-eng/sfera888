import type { Metadata } from "next";
import { QuickLeadForm } from "./QuickLeadForm";

// Страница платного трафика с Авито: индексировать её не нужно и вредно —
// она дублирует смыслы публичных посадочных, но живёт по прямой ссылке из
// автоответа в переписке.
export const metadata: Metadata = {
  title: "Мастера вашего города — заявка за минуту",
  description:
    "Частные городские мастера. Оставьте заявку и узнайте стоимость сразу от нескольких мастеров. Недорого, без посредников.",
  robots: { index: false, follow: false },
};

export default function ZayavkaPage() {
  return <QuickLeadForm />;
}
