import { useState } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Filter,
  CheckCircle2,
  XCircle,
  Calendar,
  MapPin,
  Wrench,
  User,
  Phone,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useGetCities } from "@workspace/api-client-react";

// Types
interface PartnerLead {
  id: number;
  clientName: string;
  clientPhone: string;
  city: string;
  district: string;
  serviceType: string;
  area: string;
  services: string | null;
  comment: string | null;
  source: string | null;
  isPossibleDuplicate: boolean | null;
  trafficPartnerId: number | null;
  partner_name?: string;
  createdAt: string;
  scheduledAt: string | null;
}

interface LeadsResponse {
  rows: PartnerLead[];
  total: number;
  page: number;
  limit: number;
}

const rejectionReasons = [
  { value: "duplicate", label: "Дубль" },
  { value: "spam", label: "Мусор" },
  { value: "non_target", label: "Нецелевой" },
  { value: "other", label: "Другое" },
];

const rejectionReasonLabels: Record<string, string> = {
  duplicate: "Дубль",
  spam: "Мусор",
  non_target: "Нецелевой",
  other: "Другое",
};

// API functions
async function fetchPartnerLeads(params: {
  partner_id?: number;
  city?: string;
  page?: number;
  limit?: number;
}): Promise<LeadsResponse> {
  const qs = new URLSearchParams();
  if (params.partner_id) qs.set("partner_id", String(params.partner_id));
  if (params.city) qs.set("city", params.city);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const r = await fetch(`/api/crm/partner-leads?${qs}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch leads");
  return r.json();
}

async function approveLead(id: number) {
  const r = await fetch(`/api/crm/partner-leads/${id}/approve`, {
    method: "POST",
    credentials: "include",
  });
  if (!r.ok) throw new Error("Failed to approve lead");
  return r.json();
}

async function rejectLead(id: number, reason: string, comment?: string) {
  const r = await fetch(`/api/crm/partner-leads/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reason, comment }),
  });
  if (!r.ok) throw new Error("Failed to reject lead");
  return r.json();
}

// Reject Modal
function RejectModal({
  open,
  onOpenChange,
  lead,
  onReject,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: PartnerLead | null;
  onReject: (reason: string, comment?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="w-5 h-5" />
            Отклонить лид
          </DialogTitle>
          <DialogDescription>
            Выберите причину отклонения. Партнёр увидит причину в своём кабинете.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Причина</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите причину" />
              </SelectTrigger>
              <SelectContent>
                {rejectionReasons.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Комментарий (необязательно)</label>
            <Input
              placeholder="Дополнительные пояснения..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <div className="bg-muted p-3 rounded-lg text-sm">
            <div className="font-medium">{lead.clientName}</div>
            <div className="text-muted-foreground">{lead.clientPhone}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onReject(reason, comment);
              setReason("");
              setComment("");
            }}
            disabled={!reason}
          >
            Отклонить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Main Page
export default function PartnerLeadsReviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: cities = [] } = useGetCities();
  const [page, setPage] = useState(1);
  const limit = 20;
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<PartnerLead | null>(null);

  const { data, isLoading, refetch } = useQuery<LeadsResponse>({
    queryKey: ["partner-leads", { partner_id: partnerFilter, city: cityFilter, page, limit }],
    queryFn: () => fetchPartnerLeads({ partner_id: partnerFilter !== "all" ? parseInt(partnerFilter) : undefined, city: cityFilter !== "all" ? cityFilter : undefined, page, limit }),
  });

  const approveMutation = useMutation({
    mutationFn: approveLead,
    onSuccess: () => {
      toast({ title: "Лид подтверждён", description: "Отправлен в ленту мастеров" });
      queryClient.invalidateQueries({ queryKey: ["partner-leads"] });
    },
    onError: () => toast({ title: "Ошибка", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason, comment }: { id: number; reason: string; comment?: string }) => rejectLead(id, reason, comment),
    onSuccess: () => {
      toast({ title: "Лид отклонён", description: "Партнёр увидит причину в своём кабинете" });
      queryClient.invalidateQueries({ queryKey: ["partner-leads"] });
      setRejectModalOpen(false);
    },
    onError: () => toast({ title: "Ошибка", variant: "destructive" }),
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const leads = data?.rows ?? [];
  const totalWaiting = data?.total ?? 0;

  const handleApprove = (lead: PartnerLead) => {
    approveMutation.mutate(lead.id);
  };

  const handleRejectClick = (lead: PartnerLead) => {
    setSelectedLead(lead);
    setRejectModalOpen(true);
  };

  const handleReject = (reason: string, comment?: string) => {
    if (selectedLead) {
      rejectMutation.mutate({ id: selectedLead.id, reason, comment });
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
                <Filter className="w-6 h-6" />
                Лиды партнёров
              </h1>
              <p className="text-muted-foreground text-sm">
                Проверка лидов перед отправкой в ленту мастеров
              </p>
            </div>
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-2 px-4 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm font-medium">Ожидают проверки:</span>
                <span className="text-lg font-bold">{totalWaiting}</span>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={partnerFilter} onValueChange={setPartnerFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Все партнёры" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все партнёры</SelectItem>
                    {/* TODO: fetch partners list for filter */}
                  </SelectContent>
                </Select>
                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Все города" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все города</SelectItem>
                    {cities.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => { setPartnerFilter("all"); setCityFilter("all"); setPage(1); }}>
                  Сбросить
                </Button>
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
                      <th className="text-left px-4 py-3 text-sm font-medium">Дата</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Партнёр</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Клиент</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Город / Адрес</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Вид работ</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Дубль</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Комментарий</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-muted-foreground">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                          Загрузка...
                        </td>
                      </tr>
                    ) : leads.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-muted-foreground">
                          Нет лидов на проверке
                        </td>
                      </tr>
                    ) : (
                      leads.map((lead) => (
                        <tr key={lead.id} className="border-t hover:bg-muted/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 text-sm">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              {new Date(lead.createdAt).toLocaleDateString("ru-RU", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-sm">{lead.partner_name || `Партнёр #${lead.trafficPartnerId}`}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-sm">{lead.clientName}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {lead.clientPhone}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-muted-foreground" />
                              {lead.city}
                            </div>
                            <div className="text-xs text-muted-foreground">{lead.district}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm flex items-center gap-1">
                              <Wrench className="w-3 h-3 text-muted-foreground" />
                              {lead.serviceType}
                            </div>
                            {lead.services && (
                              <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                                {lead.services}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {lead.isPossibleDuplicate ? (
                              <Badge variant="destructive" className="text-xs">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Дубль
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {lead.comment || "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                className="h-8"
                                onClick={() => handleApprove(lead)}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                Подтвердить
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleRejectClick(lead)}
                                disabled={rejectMutation.isPending}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Отклонить
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    Страница {page} из {totalPages} (всего: {data?.total})
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <RejectModal
          open={rejectModalOpen}
          onOpenChange={setRejectModalOpen}
          lead={selectedLead}
          onReject={handleReject}
        />
      </Layout>
    </ProtectedRoute>
  );
}
