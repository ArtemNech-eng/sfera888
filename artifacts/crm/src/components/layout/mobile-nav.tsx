import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Inbox, Users, Activity, MoreHorizontal,
  Brain, Smartphone, MessagesSquare, ClipboardList, CalendarCheck,
  Wallet, BarChart3, Settings, UserCog, LogOut, Trash2, Bot,
  MessageCircle, TrendingUp, Tag, X, Filter,
} from "lucide-react";

const NAV_MAIN = [
  { href: "/dashboard", label: "Дашборд",  icon: LayoutDashboard },
  { href: "/leads",     label: "Заявки",   icon: Inbox },
  { href: "/work-monitor", label: "В работе", icon: Activity },
  { href: "/masters",   label: "Мастера",  icon: Users },
];

export function MobileNav({
  unreadCount = 0,
  leadsBadge = 0,
  openTasksCount = 0,
  unreadDialogs = 0,
}: {
  unreadCount?: number;
  leadsBadge?: number;
  openTasksCount?: number;
  unreadDialogs?: number;
}) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const userPerms: string[] = (user as any).permissions ?? [];

  const moreItems = [
    { href: "/master-chat",   label: "Чат с мастерами",     icon: MessagesSquare,  permKey: "master-chat",  badge: unreadCount },
    { href: "/dialogs",       label: "Диалоги с клиентами", icon: MessageCircle,   permKey: "orders",       badge: unreadDialogs },
    { href: "/finance",       label: "Финансы",             icon: Wallet,          permKey: "finance" },
    { href: "/master-control", label: "Контроль мастеров",  icon: Brain,           permKey: "masters" },
    { href: "/checkins",      label: "Готовность",          icon: CalendarCheck,   permKey: "masters" },
    { href: "/tasks",         label: "Задачи",              icon: ClipboardList,   permKey: "tasks",        badge: openTasksCount },
    { href: "/avito",         label: "Авито",               icon: Tag,             permKey: "leads" },
    { href: "/analytics",     label: "Аналитика",           icon: BarChart3,       permKey: "analytics" },
    { href: "/trash",         label: "Корзина",             icon: Trash2,          permKey: "trash" },
    { href: "/ai-office",     label: "ИИ Офис",             icon: Bot,             permKey: "ai-office" },
    { href: "/settings",      label: "Настройки",           icon: Settings,        permKey: null as null },
    { href: "/users",         label: "Пользователи",        icon: UserCog,         permKey: null as null },
    { href: "/partners",          label: "Партнёры",          icon: Users,           permKey: "partners" },
    { href: "/partner-leads-review", label: "Лиды партнёров", icon: Filter,          permKey: "partner-leads-review" },
    { href: "/partner-analytics", label: "Аналитика партнёров", icon: BarChart3,    permKey: "partner-analytics" },
  ];

  const visibleMore = moreItems.filter(item => {
    if (user.role === "admin") return true;
    if (item.permKey === null) return false;
    return userPerms.includes(item.permKey);
  });

  const badges: Record<string, number> = {
    "/leads": leadsBadge,
    "/master-chat": unreadCount,
    "/dialogs": unreadDialogs,
    "/tasks": openTasksCount,
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-16 left-0 right-0 bg-card border-t border-border rounded-t-2xl shadow-2xl z-50 max-h-[75vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div>
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{
                  user.role === 'admin' ? 'Администратор' :
                  user.role === 'lead_operator' ? 'Опер. заявок' : 'Опер. мастеров'
                }</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-0 p-2">
              {visibleMore.map(item => {
                const isActive = location === item.href;
                const badge = (item as any).badge ?? 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors text-center",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                    {badge > 0 && (
                      <span className="absolute top-2 right-2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="px-4 pb-4 pt-1 border-t border-border/50 mt-1">
              <button
                onClick={() => { setOpen(false); logout(); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-destructive hover:bg-destructive/10 rounded-xl text-sm font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Выйти из аккаунта
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border md:hidden">
        <div className="flex items-stretch h-16">
          {NAV_MAIN.map(item => {
            const isActive = location === item.href;
            const badge = badges[item.href] ?? 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
                {badge > 0 && (
                  <span className="absolute top-2 right-[calc(50%-18px)] min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </Link>
            );
          })}
          <button
            onClick={() => setOpen(v => !v)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
              open ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium">Ещё</span>
          </button>
        </div>
      </nav>
    </>
  );
}
