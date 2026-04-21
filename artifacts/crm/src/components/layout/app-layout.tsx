import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Record<string, string> = {
  "/": "Дашборд",
  "/voronka": "Воронка мастеров",
  "/master-chat": "Чат с мастерами",
  "/leads": "Заявки",
  "/orders": "Буфер заказов",
  "/work-monitor": "В работе",
  "/masters": "Мастера",
  "/checkins": "Готовность",
  "/tasks": "Задачи",
  "/finance": "Финансы",
  "/analytics": "Аналитика",
  "/trash": "Корзина",
  "/ai-office": "ИИ Офис",
  "/settings": "Настройки",
  "/users": "Пользователи",
  "/avito": "Avito",
  "/avito-analytics": "Avito аналитика",
  "/avito-messages": "Avito сообщения",
  "/dialogs": "Диалоги",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && location !== "/login") {
    return null;
  }

  if (location === "/login") {
    return <>{children}</>;
  }

  const pageTitle = PAGE_TITLES[location] ?? "CRM";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {!isMobile && <Sidebar />}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className={cn(
          "border-b border-border bg-card/50 backdrop-blur-sm flex items-center z-10 sticky top-0",
          isMobile ? "h-14 px-4" : "h-16 px-8"
        )}>
          {isMobile ? (
            <div className="flex items-center gap-3 w-full">
              <img
                src={`${import.meta.env.BASE_URL}images/logo.png`}
                alt="Честный мастер"
                className="w-7 h-7 object-contain flex-shrink-0"
              />
              <h1 className="font-display font-bold text-base text-foreground">{pageTitle}</h1>
            </div>
          ) : (
            <h2 className="font-display font-semibold text-lg text-foreground/80">
              Добро пожаловать, {user?.name}
            </h2>
          )}
        </header>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex-1 min-h-0 overflow-y-auto w-full",
                isMobile
                  ? "p-3 pb-20"
                  : "max-w-7xl mx-auto p-8"
              )}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      {isMobile && <MobileNav />}
    </div>
  );
}
