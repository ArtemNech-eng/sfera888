import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { Loader2, CheckCircle2, MessageSquare, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DialogEntry {
  id: number;
  token: string;
  orderId: number;
  clientName: string;
  clientPhone: string;
  serviceType: string;
  city: string;
  district: string | null;
  totalAmount: number;
  prepaymentAmount: number;
  createdAt: string;
  publicUrl: string;
  clientSubmittedName: string | null;
  prepaymentSubmittedAt: string | null;
  prepaymentScreenshotUrl: string | null;
  prepaymentSeenAt: string | null;
  masterAlias: string | null;
  masterFullName: string | null;
  masterPhone: string | null;
}

interface ChatThread {
  token: string;
  clientName: string;
  clientPhone: string;
  serviceType: string;
  lastMessage: string;
  lastAt: string;
  lastFromClient: boolean;
  unread: number;
}

interface SupportThread {
  phone: string;
  clientName: string | null;
  lastMessage: string;
  lastAt: string;
  lastFromClient: boolean;
  unread: number;
}

interface ChatMessage {
  id: number;
  message: string;
  fromClient: boolean;
  operatorName: string | null;
  createdAt: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function parsePaymentMsg(raw: string): { type: "payment_confirm"; clientName: string; screenshotUrl: string | null; amount: number } | null {
  try {
    const p = JSON.parse(raw);
    if (p?.type === "payment_confirm") return p;
  } catch {}
  return null;
}

function PaymentCard({ payload, time }: { payload: ReturnType<typeof parsePaymentMsg>; time: string }) {
  if (!payload) return null;
  return (
    <div className="flex justify-start mb-2">
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-tl-sm overflow-hidden border border-green-200 bg-green-50 shadow-sm">
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-green-800">Подтверждение оплаты</div>
              <div className="text-[11px] text-green-700">{payload.clientName}</div>
            </div>
            <div className="ml-auto text-sm font-bold text-green-700">{payload.amount.toLocaleString("ru-RU")} ₽</div>
          </div>
          {payload.screenshotUrl && (
            <a href={payload.screenshotUrl} target="_blank" rel="noopener noreferrer" className="block px-3 pb-3">
              <img src={payload.screenshotUrl} alt="Скриншот оплаты" className="w-full rounded-xl max-h-52 object-cover border border-green-200 hover:opacity-90 transition-opacity cursor-zoom-in" />
            </a>
          )}
          {!payload.screenshotUrl && <div className="px-3 pb-3 text-xs text-green-600">Скриншот не прикреплён</div>}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">{time}</div>
      </div>
    </div>
  );
}

function ChatPanel({ token }: { token: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ messages: ChatMessage[] }>({
    queryKey: ["/api/client/chat", token, "messages"],
    queryFn: () => fetch(`/api/client/chat/${token}/messages`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 5000,
  });

  const messages = data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const msg = text.trim();
    setText("");
    try {
      const r = await fetch(`/api/client/chat/${token}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: msg }),
      });
      if (r.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/client/chat", token, "messages"] });
        queryClient.invalidateQueries({ queryKey: ["/api/client/chat-threads"] });
        queryClient.invalidateQueries({ queryKey: ["/api/client/chat-unread"] });
      } else {
        toast({ title: "Ошибка отправки", variant: "destructive" });
      }
    } catch {
      toast({ title: "Нет соединения", variant: "destructive" });
    }
    setSending(false);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="flex flex-col" style={{ height: 460 }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">Сообщений нет</div>
        )}
        {messages.map(msg => {
          const payment = parsePaymentMsg(msg.message);
          if (payment) return <PaymentCard key={msg.id} payload={payment} time={formatTime(msg.createdAt)} />;
          return (
            <div key={msg.id} className={`flex ${msg.fromClient ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${msg.fromClient ? "bg-muted text-foreground rounded-tl-sm" : "bg-primary text-white rounded-tr-sm"}`}>
                {!msg.fromClient && <div className="text-[10px] opacity-70 mb-0.5">{msg.operatorName ?? "Оператор"}</div>}
                <div className="leading-relaxed">{msg.message}</div>
                <div className={`text-[10px] mt-1 ${msg.fromClient ? "text-muted-foreground" : "opacity-70"}`}>{formatTime(msg.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-3 flex gap-2">
        <input
          className="flex-1 h-9 border rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Написать клиенту..."
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function SupportChatPanel({ phone }: { phone: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ messages: ChatMessage[] }>({
    queryKey: [`/api/client/support-messages/${phone}`],
    queryFn: () => fetch(`/api/client/support-messages/${phone}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 5_000,
  });

  const messages = data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/client/support-reply/${phone}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text.trim() }),
      });
      if (!r.ok) throw new Error();
      setText("");
      queryClient.invalidateQueries({ queryKey: [`/api/client/support-messages/${phone}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/support-threads"] });
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    }
    setSending(false);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="flex flex-col" style={{ height: 460 }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">Сообщений нет</div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.fromClient ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${msg.fromClient ? "bg-muted text-foreground rounded-tl-sm" : "bg-primary text-white rounded-tr-sm"}`}>
              {!msg.fromClient && <div className="text-[10px] opacity-70 mb-0.5">{msg.operatorName ?? "Оператор"}</div>}
              <div className="leading-relaxed">{msg.message}</div>
              <div className={`text-[10px] mt-1 ${msg.fromClient ? "text-muted-foreground" : "opacity-70"}`}>{formatTime(msg.createdAt)}</div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-3 flex gap-2">
        <input
          className="flex-1 h-9 border rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ответить клиенту..."
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function DialogsContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"chat" | "support">("chat");
  const [openChatToken, setOpenChatToken] = useState<string | null>(null);
  const [openSupportPhone, setOpenSupportPhone] = useState<string | null>(null);

  const { data: chatData } = useQuery<{ threads: ChatThread[] }>({
    queryKey: ["/api/client/chat-threads"],
    queryFn: () => fetch("/api/client/chat-threads", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 10_000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/client/chat-unread"],
    queryFn: () => fetch("/api/client/chat-unread", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 10_000,
  });

  const { data: supportData } = useQuery<{ threads: SupportThread[] }>({
    queryKey: ["/api/client/support-threads"],
    queryFn: () => fetch("/api/client/support-threads", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 8_000,
  });

  const threads = chatData?.threads ?? [];
  const chatUnread = unreadData?.count ?? 0;
  const supportThreads = supportData?.threads ?? [];
  const supportUnread = supportThreads.reduce((s, t) => s + t.unread, 0);

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <MessageSquare className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Диалоги с клиентами</h1>
            <p className="text-sm text-muted-foreground">Чаты со сметами · Поддержка PWA</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-muted/50 p-1 rounded-xl">
          <button
            onClick={() => setTab("chat")}
            className={`flex-1 h-9 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all ${tab === "chat" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <MessageSquare className="w-4 h-4" />
            Чат
            {chatUnread > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{chatUnread}</span>}
          </button>
          <button
            onClick={() => setTab("support")}
            className={`flex-1 h-9 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all ${tab === "support" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <MessageSquare className="w-4 h-4" />
            Поддержка
            {supportUnread > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{supportUnread}</span>}
          </button>
        </div>


        {/* Support Tab */}
        {tab === "support" && (
          <div className="flex gap-4" style={{ minHeight: 500 }}>
            <div className="w-64 flex-shrink-0 space-y-2">
              {supportThreads.length === 0 && (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-25" />
                  <p>Обращений пока нет</p>
                  <p className="text-xs mt-1">Клиенты напишут через вкладку «Поддержка» в приложении</p>
                </div>
              )}
              {supportThreads.map(t => (
                <button
                  key={t.phone}
                  onClick={() => setOpenSupportPhone(t.phone)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${openSupportPhone === t.phone ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold truncate">{t.clientName ?? t.phone}</span>
                    {t.unread > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">{t.unread}</span>}
                  </div>
                  {t.clientName && <div className="text-xs text-muted-foreground">{t.phone}</div>}
                  <div className={`text-xs mt-1 truncate ${t.lastFromClient ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {!t.lastFromClient && <span className="text-primary">Вы: </span>}
                    {t.lastMessage}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">{formatTime(t.lastAt)}</div>
                </button>
              ))}
            </div>
            <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden">
              {openSupportPhone ? (
                <SupportChatPanel key={openSupportPhone} phone={openSupportPhone} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-25" />
                    <p className="text-sm">Выберите обращение слева</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat Tab */}
        {tab === "chat" && (
          <div className="flex gap-4" style={{ minHeight: 500 }}>
            {/* Thread list */}
            <div className="w-64 flex-shrink-0 space-y-2">
              {threads.length === 0 && (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-25" />
                  <p>Чатов пока нет</p>
                  <p className="text-xs mt-1">Клиенты увидят кнопку «Чат» в своей смете</p>
                </div>
              )}
              {threads.map(t => (
                <button
                  key={t.token}
                  onClick={() => setOpenChatToken(t.token)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${openChatToken === t.token ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold truncate">{t.clientName}</span>
                    {t.unread > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">{t.unread}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{t.serviceType}</div>
                  <div className={`text-xs mt-1 truncate ${t.lastFromClient ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {!t.lastFromClient && <span className="text-primary">Вы: </span>}
                    {t.lastMessage}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">{formatTime(t.lastAt)}</div>
                </button>
              ))}
            </div>

            {/* Chat panel */}
            <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden">
              {openChatToken ? (
                <ChatPanel key={openChatToken} token={openChatToken} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-25" />
                    <p className="text-sm">Выберите чат слева</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default function DialogsPage() {
  return (
    <ProtectedRoute>
      <DialogsContent />
    </ProtectedRoute>
  );
}
