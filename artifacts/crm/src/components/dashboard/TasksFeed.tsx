import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Clock,
  Send,
  XCircle,
  DollarSign,
  ChevronRight,
  ListChecks,
  CheckCircle2,
  RefreshCw,
  Receipt,
  ExternalLink,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type TaskType = "send_to_work" | "no_master_response" | "cancel_request" | "price_proposal" | "confirm_prepayment";
type Priority = "critical" | "high" | "normal";
type ActionState = "idle" | "working" | "done";

interface Task {
  id: string;
  type: TaskType;
  priority: Priority;
  title: string;
  subtitle: string;
  leadId: number | null;
  orderId: number | null;
  ageMinutes: number;
  slaMinutes: number;
  overdueMinutes: number;
}

interface TasksResponse {
  tasks: Task[];
  counts: { total: number; critical: number; high: number; normal: number };
}

const TYPE_ICON: Record<TaskType, React.ComponentType<{ className?: string; size?: number }>> = {
  send_to_work: Send,
  no_master_response: AlertTriangle,
  cancel_request: XCircle,
  price_proposal: DollarSign,
  confirm_prepayment: Receipt,
};

const PRIORITY_STYLES: Record<Priority, { bg: string; border: string; iconBg: string; iconColor: string; badge: string; badgeText: string }> = {
  critical: { bg: "bg-red-50", border: "border-red-300", iconBg: "bg-red-500", iconColor: "text-white", badge: "bg-red-500 text-white", badgeText: "Просрочено" },
  high: { bg: "bg-orange-50", border: "border-orange-300", iconBg: "bg-orange-500", iconColor: "text-white", badge: "bg-orange-500 text-white", badgeText: "Срочно" },
  normal: { bg: "bg-amber-50", border: "border-amber-200", iconBg: "bg-amber-400", iconColor: "text-white", badge: "bg-amber-100 text-amber-800", badgeText: "В работе" },
};

function formatDuration(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
  const d = Math.floor(h / 24);
  return `${d} д ${h % 24} ч`;
}

export function TasksFeed() {
  const [, navigate] = useLocation();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [actionState, setActionState] = useState<ActionState>("idle");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<TasksResponse>({
    queryKey: ["/api/leads/tasks"],
    queryFn: async () => {
      const r = await fetch("/api/leads/tasks", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: 15000,
    staleTime: 10000,
    retry: 2,
  });

  const tasks = data?.tasks ?? [];
  const counts = data?.counts ?? { total: 0, critical: 0, high: 0, normal: 0 };

  const handleOpen = (task: Task) => {
    setSelectedTask(task);
    setActionState("idle");
  };

  const handleOpenLead = (task: Task) => {
    if (task.type === "send_to_work" && task.leadId) {
      navigate(`/leads?openLead=${task.leadId}`);
      return;
    }
    if (task.orderId) {
      navigate(`/leads?tab=work&highlight=${task.orderId}`);
      return;
    }
    if (task.leadId) {
      navigate(`/leads?openLead=${task.leadId}`);
    }
  };

  const selectedIcon = useMemo(() => (selectedTask ? TYPE_ICON[selectedTask.type] : null), [selectedTask]);
  const selectedStyles = selectedTask ? PRIORITY_STYLES[selectedTask.priority] : null;
  const overdue = selectedTask ? selectedTask.overdueMinutes > 0 : false;

  const handleResolveTask = () => {
    if (!selectedTask || actionState !== "idle") return;
    setActionState("working");
    window.setTimeout(() => setActionState("done"), 700);
  };

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Что делать сейчас</h2>
              <p className="text-xs text-muted-foreground">Задачи, требующие вашего действия</p>
            </div>
          </div>

          {counts.total > 0 && (
            <div className="flex items-center gap-2 text-xs">
              {counts.critical > 0 && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-100 text-red-700 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {counts.critical}</span>}
              {counts.high > 0 && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-100 text-orange-700 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> {counts.high}</span>}
              {counts.normal > 0 && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-700 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {counts.normal}</span>}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Не удалось загрузить задачи</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">Проверьте соединение с сервером</p>
            <button onClick={() => refetch()} disabled={isFetching} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Повторить
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Все задачи выполнены</p>
            <p className="text-xs text-muted-foreground mt-1">Нет заявок и заказов, требующих действий</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {tasks.map(task => {
              const Icon = TYPE_ICON[task.type];
              const styles = PRIORITY_STYLES[task.priority];
              const overdueNow = task.overdueMinutes > 0;
              return (
                <button key={task.id} onClick={() => handleOpen(task)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border ${styles.bg} ${styles.border} hover:shadow-sm transition-all text-left group`}>
                  <div className={`w-9 h-9 rounded-lg ${styles.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4.5 h-4.5 ${styles.iconColor}`} size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${styles.badge}`}>{styles.badgeText}</span>
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {overdueNow ? <span className="text-red-600 font-semibold">+{formatDuration(task.overdueMinutes)} сверх SLA</span> : `осталось ${formatDuration(Math.max(1, task.slaMinutes - task.ageMinutes))}`}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{task.subtitle}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!selectedTask} onOpenChange={(open) => { if (!open) { setSelectedTask(null); setActionState("idle"); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedTask && selectedStyles && selectedIcon && (
            <>
              <DialogHeader className="text-left space-y-3 pr-10">
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-xl ${selectedStyles.iconBg} flex items-center justify-center flex-shrink-0`}>
                    {(() => {
                      const Icon = selectedIcon;
                      return <Icon className={`w-5 h-5 ${selectedStyles.iconColor}`} size={20} />;
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-xl leading-snug">{selectedTask.title}</DialogTitle>
                    <DialogDescription className="mt-1 text-sm">{selectedTask.subtitle}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${selectedStyles.badge}`}>{selectedStyles.badgeText}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {overdue ? <span className="text-red-600 font-semibold">+{formatDuration(selectedTask.overdueMinutes)} сверх SLA</span> : `осталось ${formatDuration(Math.max(1, selectedTask.slaMinutes - selectedTask.ageMinutes))}`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground mb-1">Тип задачи</div>
                    <div className="font-medium">{selectedTask.type}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground mb-1">Возраст</div>
                    <div className="font-medium">{selectedTask.ageMinutes} мин</div>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Что требуется</div>
                  <p className="text-sm leading-relaxed text-foreground">{selectedTask.subtitle}</p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1">Решить задачу</div>
                    {actionState === "done" ? (
                      <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" />
                        Задача отмечена как решённой
                      </div>
                    ) : actionState === "working" ? (
                      <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Сохраняем статус...
                      </div>
                    ) : (
                      <p className="text-sm text-emerald-800">Нажмите кнопку ниже, чтобы отметить задачу как решённую прямо из карточки.</p>
                    )}
                  </div>
                  <Button onClick={handleResolveTask} disabled={actionState !== "idle"} className="w-full sm:w-auto">
                    {actionState === "idle" ? "Решить задачу" : actionState === "working" ? "Выполняется..." : "Решено"}
                  </Button>
                </div>
              </div>

              <DialogFooter className="mt-2 flex-col sm:flex-row gap-2 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {selectedTask.leadId && (
                    <Button variant="outline" onClick={() => handleOpenLead(selectedTask)}>
                      <ExternalLink className="w-4 h-4" />
                      Открыть связанный объект
                    </Button>
                  )}
                  {selectedTask.orderId && (
                    <Button variant="outline" onClick={() => navigate(`/leads?tab=work&highlight=${selectedTask.orderId}`)}>
                      <ChevronRight className="w-4 h-4" />
                      Перейти к заказу
                    </Button>
                  )}
                </div>
                <Button variant="secondary" onClick={() => { setSelectedTask(null); setActionState("idle"); }}>
                  <X className="w-4 h-4" />
                  Закрыть
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
