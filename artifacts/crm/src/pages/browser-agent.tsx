import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Play, Square, Globe, Send, Trash2, Plus, Eye, EyeOff,
  Bot, Monitor, Loader2, CheckCircle2, XCircle, AlertCircle,
  ChevronRight, Link2, Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AgentLog {
  id: string;
  ts: string;
  type: "thought" | "action" | "result" | "error" | "info";
  text: string;
}

interface AgentStatus {
  status: "idle" | "starting" | "running" | "done" | "error" | "stopped";
  task: string;
  sessionId: string;
  hasScreenshot: boolean;
  logs: AgentLog[];
}

interface Credential {
  site: string;
  login: string;
  last_login_at: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Готов",
  starting: "Запуск...",
  running: "Работает",
  done: "Выполнено",
  error: "Ошибка",
  stopped: "Остановлен",
};

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  starting: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  stopped: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

const LOG_ICON: Record<AgentLog["type"], React.ReactNode> = {
  thought: <ChevronRight className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />,
  action: <Play className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />,
  result: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />,
  error: <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />,
  info: <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />,
};

const QUICK_TASKS = [
  "Зайди на avito.ru, авторизуйся как Ольга и Иван, открой раздел сообщений и покажи последние 5 диалогов",
  "Открой avito.ru, авторизуйся и проверь мои активные объявления — сколько их и какие просмотры",
  "Зайди на yandex.ru и найди погоду в Краснодаре на сегодня",
  "Открой hh.ru и найди вакансии плиточника в Краснодаре",
];

export default function BrowserAgentPage() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [task, setTask] = useState("");
  const [navUrl, setNavUrl] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [newCred, setNewCred] = useState({ site: "", login: "", password: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [launched, setLaunched] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenshotPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/browser-agent/status`, { credentials: "include" });
      if (res.ok) setAgentStatus(await res.json());
    } catch {}
  }, []);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/browser-agent/credentials`, { credentials: "include" });
      if (res.ok) setCredentials(await res.json());
    } catch {}
  }, []);

  const refreshScreenshot = useCallback(async () => {
    try {
      const url = `${BASE}/api/browser-agent/screenshot?t=${Date.now()}`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok && res.status !== 204) {
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        setScreenshotUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return objUrl;
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchCredentials();
    pollRef.current = setInterval(fetchStatus, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus, fetchCredentials]);

  useEffect(() => {
    if (launched) {
      screenshotPollRef.current = setInterval(refreshScreenshot, 2000);
      return () => { if (screenshotPollRef.current) clearInterval(screenshotPollRef.current); };
    }
  }, [launched, refreshScreenshot]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentStatus?.logs]);

  const isRunning = agentStatus?.status === "running" || agentStatus?.status === "starting";

  async function handleLaunch() {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/browser-agent/launch`, {
        method: "POST", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLaunched(true);
      await refreshScreenshot();
      toast({ title: "Браузер запущен" });
    } catch (e) {
      toast({ title: "Ошибка запуска", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    try {
      await fetch(`${BASE}/api/browser-agent/stop`, { method: "POST", credentials: "include" });
      setLaunched(false);
      setScreenshotUrl(null);
      toast({ title: "Браузер остановлен" });
    } catch {}
  }

  async function handleAbort() {
    await fetch(`${BASE}/api/browser-agent/abort`, { method: "POST", credentials: "include" });
    toast({ title: "Задача прервана" });
  }

  async function handleSendTask() {
    if (!task.trim()) return;
    try {
      const res = await fetch(`${BASE}/api/browser-agent/task`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Задача отправлена" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  }

  async function handleNavigate() {
    if (!navUrl.trim()) return;
    let url = navUrl.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    try {
      await fetch(`${BASE}/api/browser-agent/navigate`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      setTimeout(refreshScreenshot, 1500);
    } catch {}
  }

  async function handleSaveCred() {
    const { site, login, password } = newCred;
    if (!site || !login || !password) return;
    try {
      await fetch(`${BASE}/api/browser-agent/credentials`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, login, password }),
      });
      setNewCred({ site: "", login: "", password: "" });
      fetchCredentials();
      toast({ title: "Учётные данные сохранены" });
    } catch {}
  }

  async function handleDeleteCred(site: string) {
    await fetch(`${BASE}/api/browser-agent/credentials/${encodeURIComponent(site)}`, {
      method: "DELETE", credentials: "include",
    });
    fetchCredentials();
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Браузер-агент</h1>
              <p className="text-xs text-muted-foreground">RPA + ИИ — управление браузером как живой человек</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {agentStatus && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[agentStatus.status]}`}>
                {STATUS_LABELS[agentStatus.status] ?? agentStatus.status}
              </span>
            )}
            {!launched ? (
              <Button onClick={handleLaunch} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Monitor className="w-4 h-4" />}
                Запустить браузер
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleStop} className="gap-2">
                <Square className="w-4 h-4" />
                Остановить
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex gap-0">
          {/* Left: browser screenshot */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
            {/* URL bar */}
            {launched && (
              <div className="px-4 py-3 border-b border-border flex gap-2 shrink-0 bg-muted/30">
                <Globe className="w-4 h-4 text-muted-foreground mt-2.5 shrink-0" />
                <Input
                  placeholder="Введите URL и нажмите Enter..."
                  value={navUrl}
                  onChange={e => setNavUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleNavigate()}
                  className="font-mono text-sm"
                />
                <Button size="sm" variant="outline" onClick={handleNavigate}>
                  <Link2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* Screenshot */}
            <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-950 relative">
              {!launched ? (
                <div className="text-center text-muted-foreground space-y-4">
                  <Monitor className="w-16 h-16 mx-auto opacity-20" />
                  <div>
                    <p className="font-medium text-white/60">Браузер не запущен</p>
                    <p className="text-xs opacity-40 mt-1">Нажмите «Запустить браузер» чтобы начать</p>
                  </div>
                  <Button onClick={handleLaunch} disabled={loading} size="sm" variant="outline"
                    className="gap-2 border-white/20 text-white/70 hover:text-white">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Запустить
                  </Button>
                </div>
              ) : screenshotUrl ? (
                <div className="relative">
                  <img
                    src={screenshotUrl}
                    alt="Браузер"
                    className="max-w-full max-h-full object-contain"
                    style={{ imageRendering: "auto" }}
                  />
                  {isRunning && (
                    <div className="absolute top-3 right-3 bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Агент работает...
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-white/40 space-y-2">
                  <Loader2 className="w-8 h-8 mx-auto animate-spin opacity-40" />
                  <p className="text-sm">Загрузка скриншота...</p>
                </div>
              )}
            </div>
          </div>

          {/* Right panel: task + logs + credentials */}
          <div className="w-96 flex flex-col overflow-hidden bg-background">
            {/* Task input */}
            <div className="p-4 border-b border-border space-y-3 shrink-0">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Задача для агента
                </Label>
                <Textarea
                  placeholder="Зайди на авито, авторизуйся и проверь сообщения..."
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  className="resize-none text-sm min-h-[80px]"
                  disabled={isRunning}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleSendTask}
                    disabled={!task.trim() || !launched || isRunning}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isRunning ? "Выполняет..." : "Выполнить"}
                  </Button>
                  {isRunning && (
                    <Button variant="destructive" size="icon" onClick={handleAbort} title="Прервать">
                      <Square className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Quick tasks */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Быстрые задачи:</p>
                <div className="space-y-1">
                  {QUICK_TASKS.map((qt, i) => (
                    <button
                      key={i}
                      onClick={() => setTask(qt)}
                      className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg bg-muted/60 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground line-clamp-1"
                    >
                      {qt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Logs */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1 min-h-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Лог действий
              </p>
              {!agentStatus?.logs?.length ? (
                <div className="text-center py-8 text-muted-foreground/50">
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Лог появится когда агент начнёт работу</p>
                </div>
              ) : (
                agentStatus.logs.map(log => (
                  <div key={log.id} className={`flex gap-2 text-xs py-1.5 px-2.5 rounded-lg
                    ${log.type === "error" ? "bg-red-50 dark:bg-red-950/20" :
                      log.type === "result" ? "bg-emerald-50 dark:bg-emerald-950/20" :
                      log.type === "thought" ? "bg-blue-50/60 dark:bg-blue-950/20" :
                      "bg-muted/30"}`}
                  >
                    {LOG_ICON[log.type]}
                    <div className="flex-1 min-w-0">
                      <span className="break-words leading-relaxed">{log.text}</span>
                      <span className="block text-muted-foreground/40 text-[10px] mt-0.5">
                        {new Date(log.ts).toLocaleTimeString("ru-RU")}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>

            {/* Credentials */}
            <div className="border-t border-border p-4 space-y-3 shrink-0 bg-muted/20">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Сохранённые аккаунты
                </p>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => setShowPasswords(!showPasswords)}
                  title={showPasswords ? "Скрыть пароли" : "Показать пароли"}
                >
                  {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>

              {credentials.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {credentials.map(c => (
                    <div key={c.site} className="flex items-center gap-2 text-xs bg-background rounded-lg px-2.5 py-1.5">
                      <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate flex-1">{c.site}</span>
                      <span className="text-muted-foreground truncate">{c.login}</span>
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                        onClick={() => handleDeleteCred(c.site)}
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5">
                <Input
                  placeholder="Сайт (avito.ru)"
                  value={newCred.site}
                  onChange={e => setNewCred(p => ({ ...p, site: e.target.value }))}
                  className="text-xs h-7"
                />
                <Input
                  placeholder="Логин / email"
                  value={newCred.login}
                  onChange={e => setNewCred(p => ({ ...p, login: e.target.value }))}
                  className="text-xs h-7"
                />
                <Input
                  placeholder="Пароль"
                  type={showPasswords ? "text" : "password"}
                  value={newCred.password}
                  onChange={e => setNewCred(p => ({ ...p, password: e.target.value }))}
                  className="text-xs h-7 col-span-2"
                />
                <Button
                  size="sm" variant="outline" className="col-span-2 h-7 gap-1.5 text-xs"
                  onClick={handleSaveCred}
                  disabled={!newCred.site || !newCred.login || !newCred.password}
                >
                  <Plus className="w-3 h-3" /> Сохранить аккаунт
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
