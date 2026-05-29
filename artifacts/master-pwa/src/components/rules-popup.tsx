import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { BookOpen, X, ChevronRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

const STORAGE_KEY = (masterId: number) => `rules_ack_${masterId}`;

export default function RulesPopup() {
  const { master } = useAuth();
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!master || master.status !== "active") return;
    const acked = localStorage.getItem(STORAGE_KEY(master.id));
    if (!acked) {
      // Small delay so the app renders first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
    return;
  }, [master?.id, master?.status]);

  function dismiss() {
    if (!master) return;
    setLeaving(true);
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY(master.id), "1");
      setVisible(false);
      setLeaving(false);
    }, 280);
  }

  function openRules() {
    dismiss();
    setTimeout(() => navigate("/work-rules"), 300);
  }

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${leaving ? "opacity-0" : "opacity-100"}`}
        onClick={dismiss}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${
          leaving ? "translate-y-full" : "translate-y-0"
        }`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-5 pb-8 pt-3 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <BookOpen size={22} className="text-primary" />
              </div>
              <div>
                <p className="font-bold text-base text-foreground">Правила работы</p>
                <p className="text-xs text-muted-foreground mt-0.5">Обязательно для всех мастеров</p>
              </div>
            </div>
            <button
              onClick={dismiss}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* Description */}
          <div className="bg-muted/60 rounded-2xl p-4 space-y-2">
            <p className="text-sm text-foreground/80 leading-relaxed">
              Перед первым заказом изучите правила — это займёт 5 минут и поможет избежать ошибок, конфликтов и штрафов.
            </p>
            <ul className="space-y-1.5 pt-1">
              {[
                "Как получать и принимать заказы",
                "Как работает смета и предоплата",
                "Правила поведения на объекте",
                "Бонусы для лучших мастеров",
              ].map(item => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={openRules}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm transition-opacity active:opacity-80"
              style={{ minHeight: 52 }}
            >
              <span>Читать правила работы</span>
              <ChevronRight size={18} />
            </button>

            <button
              onClick={dismiss}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-border text-sm font-medium text-muted-foreground transition-colors active:bg-muted"
              style={{ minHeight: 48 }}
            >
              <CheckCircle2 size={16} className="text-green-500" />
              Уже изучил правила
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
