// PendingActionsBanner — modal that appears on /home if the master has stuck
// orders awaiting their action. Spec: .kiro/specs/stuck-orders-and-master-banner
//
// Banner is dismissed in three ways:
//   1. CTA per item:
//      - call_report          → opens CallReportModal inline
//      - photos_and_amount    → navigates to order screen at #result anchor
//      - commission_payment   → navigates to /balance (где платится комиссия)
//   2. "Напомнить позже" — snoozes ALL items in the banner for 24h
//   3. Banner auto-disappears when no pending actions remain (e.g. after submit)

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { PhoneCall, ImagePlus, CreditCard, X, Clock } from "lucide-react";
import { api, type PendingAction } from "@/lib/api";
import { CallReportModal } from "./call-report-modal";

const ICON_BY_TYPE: Record<PendingAction["type"], typeof PhoneCall> = {
  call_report:        PhoneCall,
  photos_and_amount:  ImagePlus,
  commission_payment: CreditCard,
};

const COLOR_BY_TYPE: Record<PendingAction["type"], { bg: string; text: string; border: string }> = {
  call_report: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
  },
  photos_and_amount: {
    bg: "bg-orange-50 dark:bg-orange-900/20",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
  },
  commission_payment: {
    bg: "bg-rose-50 dark:bg-rose-900/20",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800",
  },
};

export function PendingActionsBanner() {
  const [, setLocation] = useLocation();
  const [actions, setActions] = useState<PendingAction[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [callReportFor, setCallReportFor] = useState<number | null>(null);
  const [snoozing, setSnoozing] = useState(false);

  async function load() {
    try {
      const data = await api.pendingActions();
      setActions(data);
    } catch {
      // fail-silent — баннер не блокирует основной flow
      setActions([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Don't render until loaded; hide when nothing pending or user dismissed
  if (!actions || actions.length === 0 || dismissed) return null;

  const handleAction = (a: PendingAction) => {
    if (a.type === "call_report") {
      setCallReportFor(a.orderId);
      return;
    }
    if (a.type === "commission_payment") {
      setLocation("/balance");
      return;
    }
    // photos_and_amount → order screen
    setLocation(`/orders?highlight=${a.orderId}`);
  };

  const handleSnoozeAll = async () => {
    setSnoozing(true);
    try {
      await Promise.allSettled(actions.map(a => api.snoozeBanner(a.orderId)));
      setDismissed(true);
    } finally {
      setSnoozing(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 backdrop-blur-sm px-4 pb-4 sm:items-center sm:pb-0"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-md bg-background rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-lg font-bold leading-tight">Нужно ваше действие</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {actions.length === 1
                  ? "По заказу нужны данные от вас"
                  : `По ${actions.length} заказам нужны данные от вас`}
              </p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="p-1.5 rounded-full hover:bg-muted transition-colors"
              aria-label="Закрыть"
            >
              <X size={16} />
            </button>
          </div>

          {/* List */}
          <div className="px-5 pb-3 space-y-2 max-h-[60vh] overflow-y-auto">
            {actions.map(a => {
              const Icon = ICON_BY_TYPE[a.type];
              const c = COLOR_BY_TYPE[a.type];
              return (
                <div
                  key={a.orderId}
                  className={`rounded-2xl border p-3.5 ${c.bg} ${c.border}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${c.text} flex-shrink-0`}>
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-snug text-foreground">{a.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock size={10} /> Висит {a.daysStuck} {a.daysStuck === 1 ? "день" : a.daysStuck < 5 ? "дня" : "дней"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAction(a)}
                    className={`mt-3 w-full h-10 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] transition-all`}
                  >
                    {a.ctaText}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Snooze */}
          <div className="px-5 pb-5 pt-2 border-t border-border">
            <button
              onClick={handleSnoozeAll}
              disabled={snoozing}
              className="w-full h-10 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {snoozing ? "Откладываю…" : "Напомнить позже (через 24ч)"}
            </button>
          </div>
        </div>
      </div>

      {/* Inline call-report modal */}
      {callReportFor != null && (
        <CallReportModal
          orderId={callReportFor}
          onClose={() => setCallReportFor(null)}
          onSubmitted={async () => {
            setCallReportFor(null);
            await load(); // refresh — that order should drop out of the list
          }}
        />
      )}
    </>
  );
}
