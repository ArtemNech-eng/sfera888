import { useState } from "react";
import { Bell, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function MaxBotBanner() {
  const { master, refresh } = useAuth();
  const [checking, setChecking] = useState(false);

  if (!master || master.status !== "active" || master.maxChatId) return null;

  const handleCheck = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  };

  const botHref = master.maxBotLink ?? "/master-pwa/";

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bell className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            Подключите бот уведомлений
          </p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            Откройте ссылку на бот{" "}
            <a
              href={botHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-900 underline underline-offset-2 break-all"
            >
              «Честный мастер»
            </a>{" "}
            в приложении Max и отправьте свой номер телефона.
            После этого вы будете получать уведомления о новых заявках, назначениях и оплатах.
          </p>
          <button
            onClick={handleCheck}
            disabled={checking}
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Проверяю…" : "Я уже подключил бот"}
          </button>
        </div>
      </div>
    </div>
  );
}
