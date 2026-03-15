import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute, useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, CheckCircle2, Circle, Clock, Trash2, ChevronDown,
  AlertTriangle, Zap, Bot, User, Calendar, Link2, Search, X,
  ClipboardList, List, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  format, isPast, isSameDay, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths,
  isToday, isSameMonth, parseISO,
} from "date-fns";
import { ru } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

type TaskStatus = "open" | "in_progress" | "done" | "snoozed";
type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskCategory = "followup" | "payment" | "amount_check" | "report_check" | "quality_check" | "rating" | "general";
type TaskType = "manual" | "ai_auto";

interface Task {
  id: number;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  assignedTo: string | null;
  relatedMasterId: number | null;
  relatedOrderId: number | null;
  masterAlias: string | null;
  orderLabel: string | null;
  dueAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  aiReason: string | null;
  createdBy: string | null;
  createdAt: string;
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; dot: string; chip: string }> = {
  low:    { label: "Низкий",  color: "bg-slate-100 text-slate-600", dot: "bg-slate-400",  chip: "bg-slate-100 text-slate-700 border-slate-200" },
  medium: { label: "Средний", color: "bg-blue-100 text-blue-700",   dot: "bg-blue-500",   chip: "bg-blue-50 text-blue-700 border-blue-200" },
  high:   { label: "Высокий", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500",  chip: "bg-amber-50 text-amber-700 border-amber-200" },
  urgent: { label: "Срочно",  color: "bg-red-100 text-red-700",     dot: "bg-red-500",    chip: "bg-red-50 text-red-700 border-red-200" },
};

const CATEGORY_CONFIG: Record<TaskCategory, { label: string; icon: any }> = {
  followup:      { label: "Связаться",   icon: Clock },
  payment:       { label: "Долг",        icon: AlertTriangle },
  amount_check:  { label: "Сумма",       icon: AlertTriangle },
  report_check:  { label: "Отчёт/Фото", icon: ClipboardList },
  quality_check: { label: "Качество",    icon: CheckCircle2 },
  rating:        { label: "Рейтинг",     icon: Zap },
  general:       { label: "Общее",       icon: Circle },
};

const STATUS_TABS = [
  { key: "all",         label: "Все" },
  { key: "open",        label: "Открытые" },
  { key: "in_progress", label: "В работе" },
  { key: "done",        label: "Выполнены" },
] as const;

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function useTasks() {
  return useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const r = await fetch("/api/tasks", { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 15_000,
  });
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: TaskCategory }) {
  const cfg = CATEGORY_CONFIG[category];
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function TaskCard({
  task, onStatusChange, onDelete, compact = false,
}: {
  task: Task;
  onStatusChange: (id: number, status: TaskStatus) => void;
  onDelete: (id: number) => void;
  compact?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isDone = task.status === "done";
  const isOverdue = task.dueAt && !isDone && isPast(new Date(task.dueAt));

  return (
    <div className={`group bg-card rounded-2xl border shadow-sm p-4 transition-all duration-150 ${
      isDone
        ? "opacity-60 border-border/30"
        : isOverdue
        ? "border-red-200 shadow-red-50"
        : "border-border/50 hover:shadow-md"
    }`}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => onStatusChange(task.id, isDone ? "open" : "done")}
          className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
        >
          {isDone
            ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            : task.status === "in_progress"
            ? <Clock className="w-5 h-5 text-blue-500" />
            : <Circle className="w-5 h-5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`font-medium text-sm leading-snug ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {task.title}
            </p>
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-6 z-30 bg-card border border-border/50 rounded-xl shadow-xl py-1 w-44 text-sm"
                  onClick={() => setMenuOpen(false)}
                >
                  {task.status !== "in_progress" && (
                    <button
                      className="w-full px-3 py-2 text-left hover:bg-muted/50 flex items-center gap-2"
                      onClick={() => onStatusChange(task.id, "in_progress")}
                    >
                      <Clock className="w-3.5 h-3.5 text-blue-500" /> В работе
                    </button>
                  )}
                  {task.status !== "open" && (
                    <button
                      className="w-full px-3 py-2 text-left hover:bg-muted/50 flex items-center gap-2"
                      onClick={() => onStatusChange(task.id, "open")}
                    >
                      <Circle className="w-3.5 h-3.5" /> Открыть снова
                    </button>
                  )}
                  <div className="border-t border-border/30 my-1" />
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
                    onClick={() => onDelete(task.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Удалить
                  </button>
                </div>
              )}
            </div>
          </div>

          {!compact && task.description && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{task.description}</p>
          )}

          {!compact && task.aiReason && (
            <div className="mt-2 flex items-start gap-1.5 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
              <Bot className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-violet-700 leading-snug">{task.aiReason}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <PriorityBadge priority={task.priority} />
            <CategoryBadge category={task.category} />

            {task.type === "ai_auto" && (
              <span className="inline-flex items-center gap-1 text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full font-medium">
                <Bot className="w-3 h-3" /> ИИ
              </span>
            )}

            {!compact && task.masterAlias && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <User className="w-3 h-3" /> {task.masterAlias}
              </span>
            )}

            {!compact && task.orderLabel && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Link2 className="w-3 h-3" /> {task.orderLabel}
              </span>
            )}

            {task.dueAt && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${isOverdue ? "text-red-600" : "text-muted-foreground"}`}>
                <Calendar className="w-3 h-3" />
                {isOverdue ? "Просрочено: " : ""}
                {format(new Date(task.dueAt), "d MMM, HH:mm", { locale: ru })}
              </span>
            )}

            {task.assignedTo && (
              <span className="ml-auto text-xs text-muted-foreground">→ {task.assignedTo}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar View ─────────────────────────────────────────────────────────────

function CalendarView({
  tasks,
  onStatusChange,
  onDelete,
  onCreateForDay,
}: {
  tasks: Task[];
  onStatusChange: (id: number, status: TaskStatus) => void;
  onDelete: (id: number) => void;
  onCreateForDay: (date: Date) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const tasksForDay = (day: Date) =>
    tasks.filter(t => t.dueAt && isSameDay(parseISO(t.dueAt), day));

  const selectedDayTasks = selectedDay ? tasksForDay(selectedDay) : [];

  const noDateTasks = tasks.filter(t => !t.dueAt && t.status !== "done");

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <button
            onClick={() => { setCurrentMonth(subMonths(currentMonth, 1)); setSelectedDay(null); }}
            className="p-2 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="font-display font-semibold text-base capitalize">
            {format(currentMonth, "LLLL yyyy", { locale: ru })}
          </h2>
          <button
            onClick={() => { setCurrentMonth(addMonths(currentMonth, 1)); setSelectedDay(null); }}
            className="p-2 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border/50">
          {WEEKDAYS.map(d => (
            <div key={d} className={`py-2 text-center text-xs font-semibold ${d === "Сб" || d === "Вс" ? "text-red-400" : "text-muted-foreground"}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dayTasks = tasksForDay(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const todayDay = isToday(day);
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            const hasOverdue = dayTasks.some(t => t.status !== "done" && isPast(new Date(t.dueAt!)));

            return (
              <div
                key={i}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`min-h-[80px] p-1.5 border-b border-r border-border/30 cursor-pointer transition-colors ${
                  !isCurrentMonth ? "bg-muted/20" : "bg-card hover:bg-muted/30"
                } ${isSelected ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""} ${
                  i % 7 === 6 ? "border-r-0" : ""
                }`}
              >
                {/* Day number */}
                <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1 ${
                  todayDay
                    ? "bg-primary text-primary-foreground"
                    : !isCurrentMonth
                    ? "text-muted-foreground/40"
                    : isWeekend
                    ? "text-red-500"
                    : "text-foreground"
                }`}>
                  {format(day, "d")}
                </div>

                {/* Task chips */}
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map(t => (
                    <div
                      key={t.id}
                      className={`text-[10px] leading-tight px-1.5 py-0.5 rounded border truncate font-medium ${
                        t.status === "done"
                          ? "bg-muted/60 text-muted-foreground border-border/30 line-through"
                          : PRIORITY_CONFIG[t.priority].chip
                      }`}
                      title={t.title}
                    >
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1">
                      +{dayTasks.length - 3} ещё
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day panel */}
      {selectedDay && (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <h3 className="font-display font-semibold">
              {format(selectedDay, "d MMMM, EEEE", { locale: ru })}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onCreateForDay(selectedDay)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                <Plus className="w-3 h-3" /> Задача
              </button>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {selectedDayTasks.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Задач на этот день нет
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {selectedDayTasks.map(t => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                  compact
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* No due date tasks */}
      {noDateTasks.length > 0 && (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border/50">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Без срока — {noDateTasks.length}
            </h3>
          </div>
          <div className="p-4 space-y-3">
            {noDateTasks.map(t => (
              <TaskCard
                key={t.id}
                task={t}
                onStatusChange={onStatusChange}
                onDelete={onDelete}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Modal ──────────────────────────────────────────────────────────────

const DEFAULT_FORM = {
  title: "",
  description: "",
  priority: "medium" as TaskPriority,
  category: "general" as TaskCategory,
  assignedTo: "",
  dueAt: "",
};

function CreateModal({ onClose, onSubmit, isPending, initialDueAt }: {
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
  initialDueAt?: string;
}) {
  const [form, setForm] = useState({ ...DEFAULT_FORM, dueAt: initialDueAt ?? "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit({
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      category: form.category,
      assignedTo: form.assignedTo || null,
      dueAt: form.dueAt || null,
      type: "manual",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
        <div className="p-5 border-b border-border/50 flex justify-between items-center">
          <h2 className="font-display font-semibold text-lg">Новая задача</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Название *</label>
            <input
              autoFocus
              value={form.title}
              onChange={e => setForm(v => ({ ...v, title: e.target.value }))}
              placeholder="Что нужно сделать?"
              className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Описание</label>
            <textarea
              value={form.description}
              onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
              placeholder="Подробности..."
              rows={3}
              className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Приоритет</label>
              <select
                value={form.priority}
                onChange={e => setForm(v => ({ ...v, priority: e.target.value as TaskPriority }))}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
                <option value="urgent">Срочно</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Категория</label>
              <select
                value={form.category}
                onChange={e => setForm(v => ({ ...v, category: e.target.value as TaskCategory }))}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="general">Общее</option>
                <option value="followup">Связаться</option>
                <option value="payment">Долг</option>
                <option value="amount_check">Сумма</option>
                <option value="report_check">Отчёт/Фото</option>
                <option value="quality_check">Качество</option>
                <option value="rating">Рейтинг</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Срок</label>
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={e => setForm(v => ({ ...v, dueAt: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Назначить</label>
              <input
                value={form.assignedTo}
                onChange={e => setForm(v => ({ ...v, assignedTo: e.target.value }))}
                placeholder="Логин оператора"
                className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border/60 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!form.title.trim() || isPending}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Сохраняем..." : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Tasks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tasks, isLoading } = useTasks();

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [statusTab, setStatusTab] = useState<"all" | TaskStatus>("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createDueAt, setCreateDueAt] = useState<string | undefined>();

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowCreate(false);
      setCreateDueAt(undefined);
      toast({ title: "Задача создана" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) =>
      fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/tasks/${id}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Задача удалена" });
    },
  });

  const filtered = useMemo(() => {
    if (!tasks) return [];
    let list = [...tasks];
    if (statusTab !== "all") list = list.filter(t => t.status === statusTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.masterAlias?.toLowerCase().includes(q) ||
        t.orderLabel?.toLowerCase().includes(q)
      );
    }
    const ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    list.sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (b.status === "done" && a.status !== "done") return -1;
      return ORDER[a.priority] - ORDER[b.priority];
    });
    return list;
  }, [tasks, statusTab, search]);

  const stats = useMemo(() => {
    if (!tasks) return { open: 0, urgent: 0, done: 0 };
    const active = tasks.filter(t => t.status !== "done");
    return {
      open: active.length,
      urgent: active.filter(t => t.priority === "urgent").length,
      done: tasks.filter(t => t.status === "done").length,
    };
  }, [tasks]);

  const handleCreateForDay = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = date.getFullYear();
    const mo = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    setCreateDueAt(`${y}-${mo}-${d}T09:00`);
    setShowCreate(true);
  };

  const handleStatusChange = (id: number, status: TaskStatus) =>
    updateMutation.mutate({ id, status });

  const handleDelete = (id: number) => deleteMutation.mutate(id);

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]}>
      <Layout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Задачи</h1>
              <p className="text-muted-foreground mt-1">Контроль и ведение сделок</p>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex rounded-xl border border-border/60 overflow-hidden bg-background text-sm">
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-2 flex items-center gap-1.5 font-medium transition-colors ${
                    viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List className="w-4 h-4" /> Список
                </button>
                <button
                  onClick={() => setViewMode("calendar")}
                  className={`px-3 py-2 flex items-center gap-1.5 font-medium transition-colors ${
                    viewMode === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Calendar className="w-4 h-4" /> Календарь
                </button>
              </div>
              <button
                onClick={() => { setCreateDueAt(undefined); setShowCreate(true); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
              >
                <Plus className="w-4 h-4" /> Создать
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-4 text-center">
              <p className="text-2xl font-display font-bold text-foreground">{stats.open}</p>
              <p className="text-xs text-muted-foreground mt-1">Активных</p>
            </div>
            <div className={`bg-card rounded-2xl border shadow-sm p-4 text-center ${stats.urgent > 0 ? "border-red-200" : "border-border/50"}`}>
              <p className={`text-2xl font-display font-bold ${stats.urgent > 0 ? "text-red-600" : "text-foreground"}`}>{stats.urgent}</p>
              <p className="text-xs text-muted-foreground mt-1">Срочных</p>
            </div>
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-4 text-center">
              <p className="text-2xl font-display font-bold text-emerald-600">{stats.done}</p>
              <p className="text-xs text-muted-foreground mt-1">Выполнено</p>
            </div>
          </div>

          {/* Calendar mode */}
          {viewMode === "calendar" ? (
            isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <CalendarView
                tasks={tasks ?? []}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onCreateForDay={handleCreateForDay}
              />
            )
          ) : (
            <>
              {/* List filters */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex rounded-xl border border-border/60 overflow-hidden bg-background text-sm">
                  {STATUS_TABS.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setStatusTab(tab.key as any)}
                      className={`px-4 py-2 font-medium transition-colors ${
                        statusTab === tab.key
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {tab.label}
                      {tab.key === "open" && stats.open > 0 && (
                        <span className={`ml-1.5 text-xs font-bold rounded-full px-1.5 py-0.5 ${
                          statusTab === "open" ? "bg-white/20" : "bg-primary/10 text-primary"
                        }`}>
                          {stats.open}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск задач..."
                    className="w-full pl-9 pr-8 py-2 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <ClipboardList className="w-10 h-10 opacity-30" />
                  <p className="text-sm">{search ? "Ничего не найдено" : "Задач нет"}</p>
                  {!search && (
                    <button
                      onClick={() => setShowCreate(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      Создать первую задачу
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {showCreate && (
          <CreateModal
            onClose={() => { setShowCreate(false); setCreateDueAt(undefined); }}
            onSubmit={data => createMutation.mutate(data)}
            isPending={createMutation.isPending}
            initialDueAt={createDueAt}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
}
