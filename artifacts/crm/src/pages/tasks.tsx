import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute, useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, CheckCircle2, Circle, Clock, Trash2,
  AlertTriangle, Zap, Bot, User, Calendar, Link2, Search, X,
  ClipboardList, List, ChevronLeft, ChevronRight, ArrowRight,
} from "lucide-react";
import {
  format, isPast, isSameDay, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths,
  isToday, isSameMonth, parseISO,
} from "date-fns";
import { ru } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

// ─── Types ─────────────────────────────────────────────────────────────────────

type TaskStatus   = "open" | "in_progress" | "done" | "snoozed";
type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskCategory = "followup" | "payment" | "amount_check" | "report_check" | "quality_check" | "rating" | "general";
type TaskType     = "manual" | "ai_auto";

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

// ─── Config ────────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, {
  label: string; color: string; dot: string; chip: string; border: string; bg: string;
}> = {
  low:    { label: "Низкий",  color: "bg-slate-100 text-slate-600", dot: "bg-slate-400",  chip: "bg-slate-100 text-slate-700 border-slate-200",   border: "border-l-slate-300",  bg: "" },
  medium: { label: "Средний", color: "bg-blue-100 text-blue-700",   dot: "bg-blue-500",   chip: "bg-blue-50 text-blue-700 border-blue-200",        border: "border-l-blue-400",   bg: "" },
  high:   { label: "Высокий", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500",  chip: "bg-amber-50 text-amber-700 border-amber-200",     border: "border-l-amber-400",  bg: "" },
  urgent: { label: "Срочно",  color: "bg-red-100 text-red-700",     dot: "bg-red-500",    chip: "bg-red-50 text-red-700 border-red-200",           border: "border-l-red-500",    bg: "bg-red-50/40" },
};

const CATEGORY_CONFIG: Record<TaskCategory, { label: string; icon: any; color: string }> = {
  followup:      { label: "Связаться",   icon: Clock,         color: "text-blue-500" },
  payment:       { label: "Долг",        icon: AlertTriangle, color: "text-red-500" },
  amount_check:  { label: "Сумма",       icon: AlertTriangle, color: "text-amber-500" },
  report_check:  { label: "Отчёт/Фото", icon: ClipboardList, color: "text-teal-500" },
  quality_check: { label: "Качество",    icon: CheckCircle2,  color: "text-emerald-500" },
  rating:        { label: "Рейтинг",     icon: Zap,           color: "text-violet-500" },
  general:       { label: "Общее",       icon: Circle,        color: "text-slate-400" },
};

const STATUS_TABS = [
  { key: "all",         label: "Все" },
  { key: "open",        label: "Открытые" },
  { key: "in_progress", label: "В работе" },
  { key: "done",        label: "Выполнены" },
] as const;

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// ─── Data hook ─────────────────────────────────────────────────────────────────

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

// ─── Small UI pieces ───────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: TaskPriority }) {
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_CONFIG[priority].dot}`} />;
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${cfg.color}`}>
      <PriorityDot priority={priority} />
      {cfg.label}
    </span>
  );
}

function CategoryTag({ category }: { category: TaskCategory }) {
  const cfg = CATEGORY_CONFIG[category];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Task Card (redesigned) ────────────────────────────────────────────────────

function TaskCard({
  task,
  onStatusChange,
  onDelete,
  compact = false,
}: {
  task: Task;
  onStatusChange: (id: number, status: TaskStatus) => void;
  onDelete: (id: number) => void;
  compact?: boolean;
}) {
  const isDone    = task.status === "done";
  const isInProg  = task.status === "in_progress";
  const isOverdue = task.dueAt && !isDone && isPast(new Date(task.dueAt));
  const pcfg      = PRIORITY_CONFIG[task.priority];

  return (
    <div className={`
      group relative bg-card rounded-xl border border-l-4 shadow-sm
      transition-all duration-150 overflow-hidden
      ${isDone    ? "opacity-55 border-border/30 border-l-border/30" : ""}
      ${isOverdue && !isDone ? "border-red-200 border-l-red-500 shadow-red-50" : ""}
      ${!isDone && !isOverdue ? `border-border/50 ${pcfg.border} hover:shadow-md` : ""}
      ${task.priority === "urgent" && !isDone ? pcfg.bg : ""}
    `}>
      <div className="flex items-stretch">
        {/* Status toggle */}
        <button
          onClick={() => onStatusChange(task.id, isDone ? "open" : "done")}
          className="flex-shrink-0 w-12 flex items-center justify-center hover:bg-muted/40 transition-colors"
          title={isDone ? "Открыть снова" : "Отметить выполненным"}
        >
          {isDone
            ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            : isInProg
            ? <Clock className="w-5 h-5 text-blue-500" />
            : <Circle className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          }
        </button>

        {/* Main content */}
        <div className="flex-1 min-w-0 py-3 pr-3">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm leading-snug ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {task.title}
              </p>
              {!compact && task.description && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                  {task.description}
                </p>
              )}
            </div>

            {/* Action buttons — always visible */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-1">
              {!isDone && !isInProg && (
                <button
                  onClick={() => onStatusChange(task.id, "in_progress")}
                  title="Взять в работу"
                  className="hidden group-hover:flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <ArrowRight className="w-3 h-3" /> В работе
                </button>
              )}
              {isInProg && (
                <button
                  onClick={() => onStatusChange(task.id, "open")}
                  title="Убрать из работы"
                  className="hidden group-hover:flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <Circle className="w-3 h-3" /> Пауза
                </button>
              )}
              <button
                onClick={() => onDelete(task.id)}
                title="Удалить"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* AI reason */}
          {!compact && task.aiReason && (
            <div className="mt-2 flex items-start gap-1.5 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
              <Bot className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-violet-700 leading-snug">{task.aiReason}</p>
            </div>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            <PriorityBadge priority={task.priority} />
            <CategoryTag category={task.category} />

            {task.type === "ai_auto" && (
              <span className="inline-flex items-center gap-1 text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-md font-medium">
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
              <span className={`inline-flex items-center gap-1 text-xs font-medium ml-auto ${
                isOverdue ? "text-red-600" : isDone ? "text-muted-foreground" : "text-muted-foreground"
              }`}>
                <Calendar className="w-3 h-3" />
                {isOverdue ? "Просрочено · " : ""}
                {format(new Date(task.dueAt), "d MMM, HH:mm", { locale: ru })}
              </span>
            )}

            {task.assignedTo && !task.dueAt && (
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
  const [selectedDay, setSelectedDay]   = useState<Date | null>(null);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end   = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const tasksForDay = (day: Date) =>
    tasks.filter(t => t.dueAt && isSameDay(parseISO(t.dueAt), day));

  const selectedDayTasks = selectedDay ? tasksForDay(selectedDay) : [];
  const noDateTasks      = tasks.filter(t => !t.dueAt && t.status !== "done");

  // Click on cell background → open create modal
  const handleCellClick = (day: Date, e: React.MouseEvent) => {
    // Only if click is directly on the cell (not on a chip)
    if ((e.target as HTMLElement).closest("[data-chip]")) return;
    onCreateForDay(day);
  };

  // Click on a task chip → select that day for detail view
  const handleChipClick = (day: Date, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDay(prev => prev && isSameDay(prev, day) ? null : day);
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <button
            onClick={() => { setCurrentMonth(subMonths(currentMonth, 1)); setSelectedDay(null); }}
            className="p-2 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <h2 className="font-display font-semibold text-base capitalize">
              {format(currentMonth, "LLLL yyyy", { locale: ru })}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Нажмите на день, чтобы добавить задачу
            </p>
          </div>
          <button
            onClick={() => { setCurrentMonth(addMonths(currentMonth, 1)); setSelectedDay(null); }}
            className="p-2 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border/50 bg-muted/20">
          {WEEKDAYS.map(d => (
            <div key={d} className={`py-2.5 text-center text-xs font-semibold tracking-wide ${
              d === "Сб" || d === "Вс" ? "text-red-400" : "text-muted-foreground"
            }`}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dayTasks       = tasksForDay(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const todayDay       = isToday(day);
            const isSelected     = selectedDay && isSameDay(day, selectedDay);
            const isWeekend      = day.getDay() === 0 || day.getDay() === 6;
            const hasUrgent      = dayTasks.some(t => t.priority === "urgent" && t.status !== "done");
            const allDone        = dayTasks.length > 0 && dayTasks.every(t => t.status === "done");

            return (
              <div
                key={i}
                onClick={e => isCurrentMonth && handleCellClick(day, e)}
                className={`
                  relative min-h-[90px] p-1.5 border-b border-r border-border/25
                  transition-colors select-none
                  ${i % 7 === 6 ? "border-r-0" : ""}
                  ${Math.floor(i / 7) === Math.floor((calendarDays.length - 1) / 7) ? "border-b-0" : ""}
                  ${!isCurrentMonth
                    ? "bg-muted/10 cursor-default"
                    : isSelected
                    ? "bg-primary/5 cursor-pointer"
                    : "bg-card hover:bg-muted/30 cursor-pointer"
                  }
                `}
              >
                {/* Day number */}
                <div className={`
                  w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1 transition-colors
                  ${todayDay ? "bg-primary text-primary-foreground font-bold" : ""}
                  ${!todayDay && !isCurrentMonth ? "text-muted-foreground/30" : ""}
                  ${!todayDay && isCurrentMonth && isWeekend ? "text-red-500" : ""}
                  ${!todayDay && isCurrentMonth && !isWeekend ? "text-foreground" : ""}
                `}>
                  {format(day, "d")}
                </div>

                {/* Task chips */}
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map(t => (
                    <div
                      key={t.id}
                      data-chip="true"
                      onClick={e => handleChipClick(day, e)}
                      className={`
                        text-[10px] leading-tight px-1.5 py-0.5 rounded border truncate font-medium cursor-pointer
                        hover:opacity-80 transition-opacity
                        ${t.status === "done"
                          ? "bg-muted/60 text-muted-foreground border-border/30 line-through"
                          : PRIORITY_CONFIG[t.priority].chip
                        }
                      `}
                      title={t.title}
                    >
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div
                      data-chip="true"
                      onClick={e => handleChipClick(day, e)}
                      className="text-[10px] text-primary font-medium px-1 cursor-pointer hover:underline"
                    >
                      +{dayTasks.length - 3} ещё
                    </div>
                  )}
                </div>

                {/* "+" hint on hover for empty current-month days */}
                {isCurrentMonth && dayTasks.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                    <Plus className="w-5 h-5 text-primary/30" />
                  </div>
                )}

                {/* Urgent indicator */}
                {hasUrgent && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day detail panel */}
      {selectedDay && (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <h3 className="font-display font-semibold capitalize">
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
          <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Без срока</span>
            <span className="text-xs bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-full">{noDateTasks.length}</span>
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
  category:  "general" as TaskCategory,
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
      title:       form.title.trim(),
      description: form.description.trim() || null,
      priority:    form.priority,
      category:    form.category,
      assignedTo:  form.assignedTo.trim() || null,
      dueAt:       form.dueAt || null,
      type:        "manual",
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
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Название *
            </label>
            <input
              autoFocus
              value={form.title}
              onChange={e => setForm(v => ({ ...v, title: e.target.value }))}
              placeholder="Что нужно сделать?"
              className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Описание
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
              placeholder="Подробности, ссылки, контакты..."
              rows={3}
              className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Приоритет
              </label>
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
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Категория
              </label>
              <select
                value={form.category}
                onChange={e => setForm(v => ({ ...v, category: e.target.value as TaskCategory }))}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="general">Общее</option>
                <option value="followup">Связаться</option>
                <option value="payment">Долг</option>
                <option value="amount_check">Сумма</option>
                <option value="report_check">Отчёт / Фото</option>
                <option value="quality_check">Качество</option>
                <option value="rating">Рейтинг</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Срок
              </label>
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={e => setForm(v => ({ ...v, dueAt: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Назначить
              </label>
              <input
                value={form.assignedTo}
                onChange={e => setForm(v => ({ ...v, assignedTo: e.target.value }))}
                placeholder="Логин оператора"
                className="w-full px-3 py-2.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
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
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
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
  const { toast }   = useToast();
  const { data: tasks, isLoading } = useTasks();

  const [viewMode,    setViewMode]    = useState<"list" | "calendar">("list");
  const [statusTab,   setStatusTab]   = useState<"all" | TaskStatus>("all");
  const [search,      setSearch]      = useState("");
  const [showCreate,  setShowCreate]  = useState(false);
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
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (a.dueAt && !b.dueAt) return -1;
      if (!a.dueAt && b.dueAt) return 1;
      return ORDER[a.priority] - ORDER[b.priority];
    });
    return list;
  }, [tasks, statusTab, search]);

  const stats = useMemo(() => {
    if (!tasks) return { open: 0, urgent: 0, done: 0 };
    const active = tasks.filter(t => t.status !== "done");
    return {
      open:   active.length,
      urgent: active.filter(t => t.priority === "urgent").length,
      done:   tasks.filter(t => t.status === "done").length,
    };
  }, [tasks]);

  const handleCreateForDay = (date: Date) => {
    const pad  = (n: number) => String(n).padStart(2, "0");
    const y    = date.getFullYear();
    const mo   = pad(date.getMonth() + 1);
    const d    = pad(date.getDate());
    setCreateDueAt(`${y}-${mo}-${d}T09:00`);
    setShowCreate(true);
  };

  const handleStatusChange = (id: number, status: TaskStatus) => updateMutation.mutate({ id, status });
  const handleDelete        = (id: number) => deleteMutation.mutate(id);

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]}>
      <Layout>
        <div className="space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Задачи</h1>
              <p className="text-muted-foreground mt-1">Контроль и ведение сделок</p>
            </div>
            <div className="flex items-center gap-2">
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

          {/* ── Stats ── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-4 text-center">
              <p className="text-2xl font-display font-bold text-foreground">{stats.open}</p>
              <p className="text-xs text-muted-foreground mt-1">Активных</p>
            </div>
            <div className={`bg-card rounded-2xl border shadow-sm p-4 text-center transition-colors ${
              stats.urgent > 0 ? "border-red-200 bg-red-50/30" : "border-border/50"
            }`}>
              <p className={`text-2xl font-display font-bold ${stats.urgent > 0 ? "text-red-600" : "text-foreground"}`}>
                {stats.urgent}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Срочных</p>
            </div>
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-4 text-center">
              <p className="text-2xl font-display font-bold text-emerald-600">{stats.done}</p>
              <p className="text-xs text-muted-foreground mt-1">Выполнено</p>
            </div>
          </div>

          {/* ── Calendar ── */}
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
              {/* ── List filters ── */}
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
                    <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* ── List content ── */}
              {isLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <ClipboardList className="w-10 h-10 opacity-30" />
                  <p className="text-sm">{search ? "Ничего не найдено" : "Задач нет"}</p>
                  {!search && (
                    <button onClick={() => setShowCreate(true)} className="text-xs text-primary hover:underline">
                      Создать первую задачу
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
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
