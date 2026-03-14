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
  Menu,
  MessageCircle,
  MessagesSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const canSeeChat = user && ['admin', 'master_operator'].includes(user.role);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/master-chat/stats/unread"],
    enabled: !!canSeeChat,
    refetchInterval: 30_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const navItems = [
    { href: "/", label: "Дашборд", icon: LayoutDashboard, roles: ['admin'] },
    { href: "/voronka", label: "Воронка Telegram", icon: MessageCircle, roles: ['admin', 'lead_operator', 'master_operator'] },
    { href: "/master-chat", label: "Чат с мастерами", icon: MessagesSquare, roles: ['admin', 'master_operator'], badge: unreadCount > 0 ? unreadCount : null },
    { href: "/leads", label: "Заявки", icon: Inbox, roles: ['admin', 'lead_operator'] },
    { href: "/orders", label: "Буфер заказов", icon: Briefcase, roles: ['admin', 'master_operator'] },
    { href: "/masters", label: "Мастера", icon: Users, roles: ['admin', 'master_operator'] },
    { href: "/finance", label: "Финансы", icon: Wallet, roles: ['admin'] },
    { href: "/analytics", label: "Аналитика", icon: BarChart3, roles: ['admin'] },
    { href: "/settings", label: "Настройки", icon: Settings, roles: ['admin'] },
    { href: "/users", label: "Пользователи", icon: UserCog, roles: ['admin'] },
  ];

  const filteredNav = navItems.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 left-0 bg-sidebar border-r border-sidebar-border z-20">
        <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-display font-bold">
            R
          </div>
          <span className="font-display font-bold text-xl text-sidebar-foreground tracking-tight">RepairCRM</span>
        </div>
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => {
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
                  <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold leading-none">
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
      <main className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border z-20">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-display font-bold">R</div>
            <span className="font-display font-bold text-lg">RepairCRM</span>
          </div>
          <button onClick={() => setIsMobileOpen(!isMobileOpen)} className="p-2 relative">
            <Menu className="w-6 h-6" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-destructive rounded-full" />
            )}
          </button>
        </header>

        {/* Mobile Menu Dropdown */}
        {isMobileOpen && (
          <div className="md:hidden fixed inset-0 z-10 bg-background/95 backdrop-blur-sm pt-20 px-4 pb-4 flex flex-col">
            <div className="flex-1 space-y-2">
              {filteredNav.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link 
                    key={item.href} 
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium",
                      isActive ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {'badge' in item && item.badge != null && (
                      <span className="min-w-[22px] h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-white text-[11px] font-bold">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            <button onClick={logout} className="mt-auto w-full flex items-center justify-center gap-2 py-3 text-destructive font-medium bg-destructive/10 rounded-xl">
              <LogOut className="w-5 h-5" /> Выйти
            </button>
          </div>
        )}

        <div className="flex-1 p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
