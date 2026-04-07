import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, RefreshCw, MessageSquare,
  UserPlus, Send, ChevronRight, ExternalLink, Plug, Unplug,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as any;
    throw new Error(j.error ?? `HTTP ${r.status}`);
  }
  return r.json();
}

interface AvitoSettings {
  connected: boolean;
  clientId?: string;
  avitoUserId?: string;
  avitoUserName?: string;
  enabled?: boolean;
}

interface AvitoChat {
  id: string;
  created: number;
  updated: number;
  unread_counter: number;
  users: Array<{ id: number; name: string; public_user_profile?: { url: string } }>;
  context?: { value?: { title?: string } };
  last_message?: { content?: { text?: { text?: string } }; created?: number };
}

interface AvitoMessage {
  id: string;
  author_id: number;
  created: number;
  content?: { text?: { text?: string } };
  type: string;
}

export default function AvitoPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [selectedChat, setSelectedChat] = useState<AvitoChat | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: settings, isLoading: settingsLoading } = useQuery<AvitoSettings>({
    queryKey: ["/api/avito/settings"],
    queryFn: () => apiFetch("/api/avito/settings"),
    refetchInterval: 30_000,
  });

  const { data: chatsData, isLoading: chatsLoading, refetch: refetchChats } = useQuery<{ chats: AvitoChat[] }>({
    queryKey: ["/api/avito/chats"],
    queryFn: () => apiFetch("/api/avito/chats"),
    enabled: !!settings?.connected,
    refetchInterval: 60_000,
  });

  const { data: messagesData } = useQuery<{ messages: AvitoMessage[] }>({
    queryKey: ["/api/avito/chats", selectedChat?.id, "messages"],
    queryFn: () => apiFetch(`/api/avito/chats/${selectedChat!.id}/messages`),
    enabled: !!selectedChat,
    refetchInterval: 15_000,
  });

  const connectMutation = useMutation({
    mutationFn: () => apiFetch("/api/avito/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    }),
    onSuccess: (data: any) => {
      toast({ title: `Авито подключён`, description: `Аккаунт: ${data.avitoUserName ?? data.avitoUserId}` });
      qc.invalidateQueries({ queryKey: ["/api/avito/settings"] });
      qc.invalidateQueries({ queryKey: ["/api/avito/chats"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Ошибка подключения", description: e.message }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch("/api/avito/settings", { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Авито отключён" });
      qc.invalidateQueries({ queryKey: ["/api/avito/settings"] });
      setSelectedChat(null);
    },
  });

  const replyMutation = useMutation({
    mutationFn: () => apiFetch(`/api/avito/chats/${selectedChat!.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: replyText }),
    }),
    onSuccess: () => {
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["/api/avito/chats", selectedChat?.id, "messages"] });
      toast({ title: "Сообщение отправлено" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Ошибка отправки", description: e.message }),
  });

  const createLeadMutation = useMutation({
    mutationFn: (chat: AvitoChat) => {
      const user = chat.users.find(u => u.id.toString() !== settings?.avitoUserId);
      return apiFetch("/api/avito/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          clientName: user?.name,
          itemTitle: chat.context?.value?.title,
        }),
      });
    },
    onSuccess: (data: any) => {
      toast({ title: "Заявка создана", description: `ID: ${data.leadId}` });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Ошибка создания заявки", description: e.message }),
  });

  const chats = chatsData?.chats ?? [];
  const messages = messagesData?.messages ?? [];

  function formatTime(ts: number) {
    return new Date(ts * 1000).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Авито</h1>
            <p className="text-muted-foreground text-sm mt-1">Чаты с клиентами из объявлений Авито</p>
          </div>
          {settings?.connected && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetchChats()}>
                <RefreshCw className="w-4 h-4 mr-2" /> Обновить
              </Button>
              <Button
                variant="outline" size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                <Unplug className="w-4 h-4 mr-2" /> Отключить
              </Button>
            </div>
          )}
        </div>

        {/* Connection status */}
        {settingsLoading ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Загрузка...</CardContent></Card>
        ) : settings?.connected ? (
          <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-400">
                  Авито подключён — {settings.avitoUserName ?? settings.avitoUserId}
                </p>
                <p className="text-xs text-green-600/70">Входящие сообщения синхронизируются автоматически</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Connect form */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plug className="w-5 h-5 text-primary" /> Подключить Авито
              </CardTitle>
              <CardDescription>
                Введите Client ID и Client Secret из личного кабинета Авито Developers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Client ID</label>
                  <Input
                    placeholder="Введите Client ID"
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Client Secret</label>
                  <Input
                    type="password"
                    placeholder="Введите Client Secret"
                    value={clientSecret}
                    onChange={e => setClientSecret(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                  <div>
                    <p className="font-medium text-foreground">Как получить ключи:</p>
                    <ol className="mt-1 space-y-1 list-decimal list-inside">
                      <li>Перейдите на <a href="https://developers.avito.ru" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">developers.avito.ru <ExternalLink className="w-3 h-3" /></a></li>
                      <li>Создайте приложение или откройте существующее</li>
                      <li>Скопируйте Client ID и Client Secret</li>
                      <li>Убедитесь, что приложение имеет доступ к Messenger API</li>
                    </ol>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => connectMutation.mutate()}
                disabled={!clientId || !clientSecret || connectMutation.isPending}
                className="w-full"
              >
                {connectMutation.isPending ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Подключение...</>
                ) : (
                  <><Plug className="w-4 h-4 mr-2" /> Подключить Авито</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Chats section */}
        {settings?.connected && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
            {/* Chat list */}
            <Card className="lg:col-span-1 flex flex-col overflow-hidden">
              <CardHeader className="py-3 px-4 border-b shrink-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Чаты
                  {chats.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">{chats.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <div className="flex-1 overflow-y-auto">
                {chatsLoading ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">Загрузка чатов...</div>
                ) : chats.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Нет активных чатов
                  </div>
                ) : (
                  chats.map(chat => {
                    const opponent = chat.users.find(u => u.id.toString() !== settings.avitoUserId);
                    const lastText = chat.last_message?.content?.text?.text;
                    const title = chat.context?.value?.title;
                    const isSelected = selectedChat?.id === chat.id;
                    return (
                      <button
                        key={chat.id}
                        onClick={() => setSelectedChat(chat)}
                        className={cn(
                          "w-full text-left p-3 border-b hover:bg-muted/50 transition-colors",
                          isSelected && "bg-primary/5 border-l-2 border-l-primary"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm truncate">{opponent?.name ?? "Клиент"}</span>
                              {chat.unread_counter > 0 && (
                                <Badge className="bg-red-500 text-white text-[10px] h-4 px-1.5 shrink-0">
                                  {chat.unread_counter}
                                </Badge>
                              )}
                            </div>
                            {title && <p className="text-xs text-muted-foreground truncate">{title}</p>}
                            {lastText && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{lastText}</p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        </div>
                        {chat.updated && (
                          <p className="text-[10px] text-muted-foreground mt-1">{formatTime(chat.updated)}</p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Chat messages */}
            <Card className="lg:col-span-2 flex flex-col overflow-hidden">
              {!selectedChat ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Выберите чат слева</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <CardHeader className="py-3 px-4 border-b shrink-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {selectedChat.users.find(u => u.id.toString() !== settings.avitoUserId)?.name ?? "Клиент"}
                        </CardTitle>
                        {selectedChat.context?.value?.title && (
                          <CardDescription className="text-xs">
                            {selectedChat.context.value.title}
                          </CardDescription>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createLeadMutation.mutate(selectedChat)}
                        disabled={createLeadMutation.isPending}
                        className="shrink-0"
                      >
                        <UserPlus className="w-4 h-4 mr-1.5" />
                        {createLeadMutation.isPending ? "Создание..." : "Создать заявку"}
                      </Button>
                    </div>
                  </CardHeader>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.length === 0 ? (
                      <div className="text-center text-muted-foreground text-sm py-8">Нет сообщений</div>
                    ) : (
                      [...messages].reverse().map(msg => {
                        const isOurs = msg.author_id.toString() === settings.avitoUserId;
                        const text = msg.content?.text?.text;
                        return (
                          <div key={msg.id} className={cn("flex", isOurs ? "justify-end" : "justify-start")}>
                            <div className={cn(
                              "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                              isOurs
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-muted text-foreground rounded-tl-sm"
                            )}>
                              {text ? (
                                <p className="whitespace-pre-wrap">{text}</p>
                              ) : (
                                <p className="italic opacity-60">[медиафайл]</p>
                              )}
                              <p className={cn(
                                "text-[10px] mt-1",
                                isOurs ? "text-primary-foreground/60 text-right" : "text-muted-foreground"
                              )}>
                                {msg.created ? formatTime(msg.created) : ""}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Reply input */}
                  <div className="p-3 border-t shrink-0">
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Написать сообщение..."
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={2}
                        className="resize-none text-sm"
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (replyText.trim()) replyMutation.mutate();
                          }
                        }}
                      />
                      <Button
                        onClick={() => replyMutation.mutate()}
                        disabled={!replyText.trim() || replyMutation.isPending}
                        size="icon"
                        className="h-full aspect-square"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Enter — отправить, Shift+Enter — новая строка</p>
                  </div>
                </>
              )}
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
