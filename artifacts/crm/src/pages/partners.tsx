import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Phone,
  MapPin,
  ExternalLink,
  CheckCircle2,
  PauseCircle,
  Ban,
  Archive,
  ChevronLeft,
  ChevronRight,
  X,
  UserPlus,
  Eye,
  TrendingUp,
  Users,
  Inbox,
  CheckSquare,
  BarChart3,
  Clock,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useGetCities } from "@workspace/api-client-react";

// Types
interface Partner {
  id: number;
  name: string;
  phone: string;
  city: string;
  avitoAccountName: string | null;
  avitoAccountLink: string | null;
  status: "active" | "paused" | "blocked" | "archived" | "pending";
  createdAt: string;
  notes: string | null;
  login?: string;
  refSlug?: string;
  leads_this_month: number;
  accepted_this_month: number;
}

interface PartnerDetail extends Partner {
  billing_periods: any[];
}

const statusLabels: Record<string, string> = {
  active: "Активен",
  paused: "На паузе",
  blocked: "Заблокирован",
  archived: "В архиве",
  pending: "На рассмотрении",
};

const statusIcons: Record<string, React.ReactNode> = {
  active: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  paused: <PauseCircle className="w-4 h-4 text-yellow-500" />,
  blocked: <Ban className="w-4 h-4 text-red-500" />,
  archived: <Archive className="w-4 h-4 text-gray-500" />,
  pending: <Clock className="w-4 h-4 text-amber-500" />,
};

const statusBadgeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  blocked: "destructive",
  archived: "outline",
  pending: "secondary",
};

// API functions
async function fetchPartners(params: { status?: string; city?: string; search?: string }): Promise<Partner[]> {
  const qs = new URLSearchParams();
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.city && params.city !== "all") qs.set("city", params.city);
  if (params.search) qs.set("search", params.search);
  const r = await fetch(`/api/crm/partners?${qs}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch partners");
  return r.json();
}

async function fetchPartnerDetail(id: number): Promise<PartnerDetail> {
  const r = await fetch(`/api/crm/partners/${id}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch partner");
  return r.json();
}

async function createPartner(data: {
  name: string;
  phone: string;
  city: string;
  login: string;
  password: string;
  avito_account_name?: string;
  avito_account_link?: string;
  notes?: string;
  ref_slug?: string;
}) {
  console.log("[createPartner] POST /api/crm/partners", data);
  const r = await fetch("/api/crm/partners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  console.log("[createPartner] response status:", r.status);
  if (!r.ok) {
    const e = await r.json();
    console.error("[createPartner] error:", e);
    throw new Error(e.error || "Failed to create partner");
  }
  return r.json();
}

async function fetchDomain(): Promise<string> {
  const r = await fetch("/api/crm/settings/domain", { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch domain");
  const data = await r.json();
  return data.landing_domain || "https://честные-мастера.рф";
}

async function updatePartnerStatus(id: number, status: string) {
  const r = await fetch(`/api/crm/partners/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  if (!r.ok) throw new Error("Failed to update status");
  return r.json();
}

async function deletePartner(id: number) {
  const r = await fetch(`/api/crm/partners/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) throw new Error("Failed to delete partner");
  return r.status === 204 ? null : r.json();
}

// Create Partner Modal
function CreatePartnerModal({
  open,
  onOpenChange,
  cities,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cities: string[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    city: "",
    login: "",
    password: "",
    avito_account_name: "",
    avito_account_link: "",
    notes: "",
    ref_slug: "",
  });

  const mutation = useMutation({
    mutationFn: createPartner,
    onSuccess: () => {
      toast({ title: "Партнёр создан", description: "Аккаунт для доступа в PWA создан" });
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      onOpenChange(false);
      setForm({ name: "", phone: "", city: "", login: "", password: "", avito_account_name: "", avito_account_link: "", notes: "", ref_slug: "" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
      console.error("[CreatePartner] error:", e);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Новый партнёр
          </DialogTitle>
          <DialogDescription>
            Создайте профиль партнёра и аккаунт для доступа в partner-pwa
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Имя</label>
              <Input
                placeholder="Иван Иванов"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Телефон</label>
              <Input
                placeholder="+7 999 000-00-00"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Город</label>
            <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите город" />
              </SelectTrigger>
              <SelectContent>
                {cities.map((c: any) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Логин</label>
              <Input
                placeholder="partner_ivan"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Пароль</label>
              <Input
                type="text"
                placeholder="минимум 6 символов"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Аккаунт Авито</label>
              <Input
                placeholder="Название"
                value={form.avito_account_name}
                onChange={(e) => setForm({ ...form, avito_account_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Ссылка на Авито</label>
              <Input
                placeholder="https://..."
                value={form.avito_account_link}
                onChange={(e) => setForm({ ...form, avito_account_link: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Примечания</label>
            <Input
              placeholder="Дополнительная информация"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Реферальный slug</label>
            <Input
              placeholder="например, ivan123 (для ссылки /r/ivan123)"
              value={form.ref_slug}
              onChange={(e) => setForm({ ...form, ref_slug: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            onClick={() => {
              console.log("[CreatePartner] click", form);
              mutation.mutate(form);
            }}
            disabled={!form.name || !form.phone || !form.city || !form.login || form.password.length < 6 || mutation.isPending}
          >
            {mutation.isPending ? "Создание..." : "Создать партнёра"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Partner Detail Drawer
function PartnerDetailDrawer({
  partnerId,
  open,
  onOpenChange,
  domain,
}: {
  partnerId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  domain: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: partner, isLoading } = useQuery<PartnerDetail>({
    queryKey: ["partner", partnerId],
    queryFn: () => fetchPartnerDetail(partnerId!),
    enabled: !!partnerId,
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"archive" | "delete" | null>(null);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updatePartnerStatus(id, status),
    onSuccess: () => {
      toast({ title: "Статус обновлён" });
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      queryClient.invalidateQueries({ queryKey: ["partner", partnerId] });
    },
    onError: () => toast({ title: "Ошибка", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePartner(id),
    onSuccess: () => {
      toast({ title: confirmAction === "delete" ? "Партнёр удалён" : "Партнёр архивирован" });
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Ошибка", variant: "destructive" }),
  });

  if (!partner) return null;

  const canHardDelete = partner.status === "pending" && partner.leads_this_month === 0 && partner.accepted_this_month === 0;

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-w-lg mx-auto">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {partner.name}
            </DrawerTitle>
            <DrawerDescription>
              Профиль партнёра и статистика
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-4 space-y-6">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold">{partner.leads_this_month}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Inbox className="w-3 h-3" />
                        Лидов за месяц
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold">{partner.accepted_this_month}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckSquare className="w-3 h-3" />
                        Принято мастером
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Контакты</h4>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    {partner.phone}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    {partner.city}
                  </div>
                  {partner.avitoAccountName && (
                    <div className="flex items-center gap-2 text-sm">
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                      {partner.avitoAccountLink ? (
                        <a href={partner.avitoAccountLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {partner.avitoAccountName}
                        </a>
                      ) : (
                        partner.avitoAccountName
                      )}
                    </div>
                  )}
                  {partner.login && (
                    <div className="text-sm text-muted-foreground">
                      Логин: <span className="font-mono">{partner.login}</span>
                    </div>
                  )}
                  {partner.refSlug && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Ссылка:</span>{" "}
                      <a
                        href={`${domain}/r/${partner.refSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline font-mono"
                      >
                        {domain}/r/{partner.refSlug}
                      </a>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Управление статусом</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <Button
                        key={key}
                        variant={partner.status === key ? "default" : "outline"}
                        size="sm"
                        onClick={() => statusMutation.mutate({ id: partner.id, status: key })}
                        disabled={statusMutation.isPending}
                      >
                        {statusIcons[key]}
                        <span className="ml-1">{label}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                {partner.notes && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Примечания</h4>
                    <p className="text-sm text-muted-foreground">{partner.notes}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Дата регистрации</h4>
                  <p className="text-sm text-muted-foreground">
                    {new Date(partner.createdAt).toLocaleDateString("ru-RU")}
                  </p>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-medium text-sm text-red-600">Опасная зона</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => { setConfirmAction("archive"); setConfirmOpen(true); }}
                    >
                      <Archive className="w-4 h-4 mr-1" />
                      Архивировать
                    </Button>
                    {canHardDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => { setConfirmAction("delete"); setConfirmOpen(true); }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Удалить навсегда
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Закрыть</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "delete" ? "Удалить партнёра навсегда?" : "Архивировать партнёра?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === "delete"
                ? "Партнёр и его аккаунт будут полностью удалены. Это действие необратимо."
                : "Партнёр будет скрыт из списка и не сможет войти в PWA. Данные о лидах и выплатах сохранятся."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (partner) deleteMutation.mutate(partner.id);
                setConfirmOpen(false);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Выполняется..." : confirmAction === "delete" ? "Удалить" : "Архивировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Main Page
export default function PartnersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: cities = [] } = useGetCities();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: partners = [], isLoading } = useQuery<Partner[]>({
    queryKey: ["partners", { status: statusFilter, city: cityFilter, search }],
    queryFn: () => fetchPartners({ status: statusFilter, city: cityFilter, search }),
  });

  const { data: pendingPartners = [] } = useQuery<Partner[]>({
    queryKey: ["partners", { status: "pending" }],
    queryFn: () => fetchPartners({ status: "pending" }),
  });

  const { data: domain = "https://честные-мастера.рф" } = useQuery<string>({
    queryKey: ["domain"],
    queryFn: fetchDomain,
  });

  const handleRowClick = (partner: Partner) => {
    setSelectedPartnerId(partner.id);
    setDetailOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePartner(id),
    onSuccess: () => {
      toast({ title: "Готово" });
      queryClient.invalidateQueries({ queryKey: ["partners"] });
    },
    onError: () => toast({ title: "Ошибка", variant: "destructive" }),
  });

  const handleDelete = (partner: Partner) => {
    const isHardDelete = partner.status === "pending" && partner.leads_this_month === 0 && partner.accepted_this_month === 0;
    const message = isHardDelete
      ? "Партнёр будет полностью удалён. Это необратимо."
      : "Партнёр будет архивирован. Данные сохранятся, но он не сможет войти в PWA.";
    if (window.confirm(message)) {
      deleteMutation.mutate(partner.id);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users className="w-6 h-6" />
                Партнёры
              </h1>
              <p className="text-muted-foreground text-sm">
                Управление партнёрами и их аккаунтами
              </p>
            </div>
            <div className="flex items-center gap-3">
              {pendingPartners.length > 0 && (
                <Button
                  variant={statusFilter === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(statusFilter === "pending" ? "all" : "pending")}
                  className="relative"
                >
                  <AlertCircle className="w-4 h-4 mr-1.5" />
                  На рассмотрении
                  <Badge variant="destructive" className="ml-2 h-5 min-w-[20px] px-1.5 text-xs">
                    {pendingPartners.length}
                  </Badge>
                </Button>
              )}
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Добавить партнёра
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по имени, телефону, Авито..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Все статусы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все статусы</SelectItem>
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Все города" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все города</SelectItem>
                    {cities.map((c: any) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-medium">Партнёр</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Телефон</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Город</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Аккаунт Авито</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Статус</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Лидов/Принято</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-muted-foreground">
                          Загрузка...
                        </td>
                      </tr>
                    ) : partners.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-muted-foreground">
                          Нет партнёров
                        </td>
                      </tr>
                    ) : (
                      partners.map((p) => (
                        <tr
                          key={p.id}
                          className="border-t hover:bg-muted/50 cursor-pointer"
                          onClick={() => handleRowClick(p)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              с {new Date(p.createdAt).toLocaleDateString("ru-RU")}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">{p.phone}</td>
                          <td className="px-4 py-3 text-sm">{p.city}</td>
                          <td className="px-4 py-3 text-sm">
                            {p.avitoAccountName ? (
                              <span className="text-muted-foreground">{p.avitoAccountName}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusBadgeVariants[p.status]}>
                              {statusLabels[p.status]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm">
                              <span className="font-medium">{p.leads_this_month}</span>
                              <span className="text-muted-foreground"> / </span>
                              <span className="text-green-600 font-medium">{p.accepted_this_month}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleRowClick(p); }}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <CreatePartnerModal open={createModalOpen} onOpenChange={setCreateModalOpen} cities={cities.map(c => c.name)} />
        <PartnerDetailDrawer partnerId={selectedPartnerId} open={detailOpen} onOpenChange={setDetailOpen} domain={domain} />
      </Layout>
    </ProtectedRoute>
  );
}
