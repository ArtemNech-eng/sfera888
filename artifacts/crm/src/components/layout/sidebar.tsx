import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
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
  Wrench,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const navItems = [
    { 
      href: "/", 
      label: "Дашборд", 
      icon: LayoutDashboard, 
      roles: ["admin", "master_operator"] 
    },
    { 
      href: "/leads", 
      label: "Заявки", 
      icon: Inbox, 
      roles: ["admin", "lead_operator"] 
    },
    { 
      href: "/orders", 
      label: "Буфер заказов", 
      icon: Briefcase, 
      roles: ["admin", "master_operator"] 
    },
    { 
      href: "/masters", 
      label: "Мастера", 
      icon: Users, 
      roles: ["admin", "master_operator"] 
    },
    { 
      href: "/finance", 
      label: "Финансы", 
      icon: Wallet, 
      roles: ["admin", "master_operator"] 
    },
    { 
      href: "/analytics", 
      label: "Аналитика", 
      icon: BarChart3, 
      roles: ["admin", "master_operator"] 
    },
    { 
      href: "/settings", 
      label: "Настройки", 
      icon: Settings, 
      roles: ["admin"] 
    },
    { 
      href: "/users", 
      label: "Пользователи", 
      icon: UserCog, 
      roles: ["admin"] 
    },
    { 
      href: "/trash", 
      label: "Корзина", 
      icon: Trash2, 
      roles: ["admin", "master_operator"] 
    },
  ];

  const visibleItems = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="flex flex-col w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border min-h-screen">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border/50">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/20">
          <Wrench className="w-4 h-4" />
        </div>
        <span className="font-display font-bold text-xl tracking-tight">FixCRM</span>
      </div>

      <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-medium text-sm",
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50")} />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border/50 space-y-4">
        <div className="px-3">
          <p className="text-sm font-semibold truncate">{user.name}</p>
          <p className="text-xs text-sidebar-foreground/50 capitalize mt-0.5">{user.role.replace('_', ' ')}</p>
        </div>
        <Button 
          variant="ghost" 
          className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 rounded-xl"
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Выйти
        </Button>
      </div>
    </div>
  );
}
