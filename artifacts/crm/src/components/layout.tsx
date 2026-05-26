import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Inbox, 
  Briefcase, 
  Users, 
  Wallet, 
  BarChart3, 
  Settings, 
  UserCog,
  LogOut,
  MessagesSquare,
  Trash2,
  ClipboardList,
  MessageCircle,
  CalendarCheck,
  TrendingUp,
  Tag,
  ChevronDown,
  Bot,
  Coins,
  Brain,
  Activity,
  MoreHorizontal,
  X,
  RotateCcw,
  Filter,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { MobileNav } from "./layout/mobile-nav";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [trafficOpen, setTrafficOpen] = useState(false);

  const isTrafficActive = location.startsWith("/avito") && !location.startsWith("/avito-messages");

  const userPerms: string[] = (user as any)?.permissions ?? [];
  const canSeeChat = user?.role === 'admin' || userPerms.includes('master-chat');

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/master-chat/stats/unread"],
    queryFn: () => fetch("/api/master-chat/stats/unread", { credentials: "include" }).then(r => r.json()),
    enabled: !!canSeeChat,
    refetchInterval: 10_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  // Browser notifications for new unread messages
  const prevUnread = useRef<number | null>(null);
  useEffect(() => {
    if (!canSeeChat) return;
    if (prevUnread.current === null) {
      prevUnread.current = unreadCount;
      return;
    }
    if (unreadCount > prevUnread.current) {
      const diff = unreadCount - prevUnread.current;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("💬 Новые сообщения от мастеров", {
          body: `${diff} непрочитанных сообщений`,
          icon: "/favicon.ico",
        });
      } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
    prevUnread.current = unreadCount;
  }, [unreadCount, canSeeChat]);

  const { data: taskStats } = useQuery<{ open: number; urgent: number }>({
    queryKey: ["/api/tasks/stats"],
    queryFn: () => fetch("/api/tasks/stats", { credentials: "include" }).then(r => r.json()),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const openTasksCount = taskStats?.open ?? 0;

  const { data: dialogStats } = useQuery<{ count: number }>({
    queryKey: ["/api/receipts/dialogs/unread-count"],
    queryFn: () => fetch("/api/receipts/dialogs/unread-count", { credentials: "include" }).then(r => r.json()),
    enabled: !!user,
    refetchInterval: 15_000,
  });
  const unreadDialogs = dialogStats?.count ?? 0;

  const { data: leadsBadgeData } = useQuery<{ newLeads: number; problemOrders: number }>({
    queryKey: ["/api/leads/badge-stats"],
    queryFn: async () => {
      const [leadsResp, ordersResp] = await Promise.all([
        fetch("/api/leads?status=new", { credentials: "include" }),
        fetch("/api/orders?status=cancellation_requested", { credentials: "include" }),
      ]);
      const leads = leadsResp.ok ? await leadsResp.json() : [];
      const orders = ordersResp.ok ? await ordersResp.json() : [];
      return { newLeads: Array.isArray(leads) ? leads.filter((l: any) => l.status === "new").length : 0, problemOrders: Array.isArray(orders) ? orders.filter((o: any) => o.status === "cancellation_requested").length : 0 };
    },
    enabled: !!user,
    refetchInterval: 15_000,
  });
  const leadsBadge = (leadsBadgeData?.newLeads ?? 0) + (leadsBadgeData?.problemOrders ?? 0);

  const navItems = [
    { href: "/dashboard",      label: "Дашборд",              icon: LayoutDashboard,  permKey: "dashboard" },
    { href: "/master-chat",    label: "Чат с мастерами",       icon: MessagesSquare,   permKey: "master-chat",  badge: unreadCount > 0 ? unreadCount : null },
    { href: "/dialogs",        label: "Диалоги с клиентами",   icon: MessageCircle,    permKey: "orders",       badge: unreadDialogs > 0 ? unreadDialogs : null },

    { href: "/leads",          label: "Заявки",                icon: Inbox,            permKey: "leads",        badge: leadsBadge > 0 ? leadsBadge : null },
    { href: "/work-monitor",   label: "В работе",             icon: Activity,         permKey: "orders" },
    { href: "/finance",     label: "Финансы",              icon: Wallet,          permKey: "finance" },
    { href: "/masters",         label: "Мастера",              icon: Users,           permKey: "masters" },
    { href: "/token-masters",   label: "Token Masters",        icon: Zap,             permKey: "masters" },
    { href: "/master-control",  label: "Контроль мастеров",    icon: Brain,           permKey: "masters" },
    { href: "/checkins",        label: "Готовность",           icon: CalendarCheck,   permKey: "masters" },
    { href: "/tasks",       label: "Задачи",               icon: ClipboardList,   permKey: "tasks",       badge: openTasksCount > 0 ? openTasksCount : null },
    { href: "__traffic__",  label: "__group__",            icon: TrendingUp,      permKey: "leads" },
    { href: "/analytics",   label: "Аналитика",            icon: BarChart3,       permKey: "analytics" },
    { href: "/analytics/score-distribution", label: "Score мастеров",  icon: BarChart3,       permKey: "analytics" },
    { href: "/trash",       label: "Корзина",              icon: Trash2,          permKey: "trash" },
    { href: "/ai-office",   label: "ИИ Офис",              icon: Bot,             permKey: "ai-office" },
    { href: "/settings",       label: "Настройки",            icon: Settings,        permKey: null as null },
    { href: "/token-settings", label: "Токены и тарифы",       icon: Coins,           permKey: null as null },
    { href: "/token-refunds",  label: "Возвраты токенов",       icon: RotateCcw,       permKey: null as null },
    { href: "/token-purchases", label: "Пополнения токенов",    icon: Wallet,          permKey: null as null },
    { href: "/token-analytics", label: "Аналитика токенов",    icon: BarChart3,       permKey: "analytics" },
    { href: "/users",       label: "Пользователи",         icon: UserCog,         permKey: null as null },
    { href: "/partners",          label: "Партнёры",          icon: Users,           permKey: "partners" },
    { href: "/partner-leads-review", label: "Лиды партнёров", icon: Filter,          permKey: "partner-leads-review" },
    { href: "/partner-analytics", label: "Аналитика партнёров", icon: BarChart3,    permKey: "partner-analytics" },
  ];

  const filteredNav = navItems.filter(item => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (item.permKey === null) return false;
    return userPerms.includes(item.permKey);
  });

  return (
    <div className="bg-background flex min-h-screen">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 left-0 bg-sidebar border-r border-sidebar-border z-20">
        <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="Честный мастер"
            className="h-8 w-8 object-contain"
          />
          <span className="font-display font-bold text-xl text-sidebar-foreground tracking-tight">Честный мастер</span>
        </div>
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => {
            if (item.href === "__traffic__") {
              return (
                <div
                  key="traffic-group"
                  className="relative"
                  onMouseEnter={() => setTrafficOpen(true)}
                  onMouseLeave={() => setTrafficOpen(false)}
                >
                  <button
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                      isTrafficActive
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <TrendingUp className={cn("w-5 h-5 shrink-0", isTrafficActive ? "text-primary" : "text-sidebar-foreground/50")} />
                    <span className="flex-1 text-left truncate">Источники трафика</span>
                    <ChevronDown className={cn(
                      "w-4 h-4 shrink-0 transition-transform duration-200",
                      trafficOpen ? "rotate-180" : ""
                    )} />
                  </button>
                  {trafficOpen && (
                    <div className="mt-1 ml-3 pl-4 border-l-2 border-sidebar-border space-y-0.5 pb-1">
                      <Link
                        href="/avito"
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                          location === "/avito"
                            ? "bg-primary/10 text-primary"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )}
                      >
                        <Tag className={cn("w-4 h-4 shrink-0", location === "/avito" ? "text-primary" : "text-sidebar-foreground/50")} />
                        Авито
                      </Link>
                    </div>
                  )}
                </div>
              );
            }

            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-primary" : "text-sidebar-foreground/50")} />
                <span className="flex-1 truncate">{item.label}</span>
                {'badge' in item && item.badge != null && (
                  <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none animate-pulse shadow-sm shadow-red-300">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        <div className="p-4 border-t border-sidebar-border">
          <div className="bg-sidebar-accent rounded-xl p-4 flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold text-sidebar-foreground">{user?.name}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{
                user?.role === 'admin' ? 'Администратор' : 
                user?.role === 'lead_operator' ? 'Опер. заявок' : 'Опер. мастеров'
              }</p>
            </div>
            <button 
              onClick={logout}
              className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" /> Выйти
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-64 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex-shrink-0 flex items-center gap-3 px-4 h-14 bg-card border-b border-border z-20">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="Честный мастер"
            className="h-7 w-7 object-contain flex-shrink-0"
          />
          <span className="font-display font-bold text-base flex-1 truncate">Честный мастер</span>
          {(unreadCount > 0 || leadsBadge > 0) && (
            <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-20 md:pb-8 min-h-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav unreadCount={unreadCount} leadsBadge={leadsBadge} openTasksCount={openTasksCount} unreadDialogs={unreadDialogs} />
    </div>
  );
}
