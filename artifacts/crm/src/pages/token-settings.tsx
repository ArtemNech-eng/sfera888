import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { Coins, Wrench, History, Plus, Pencil, Trash2, Save, X, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenPackage {
  id: number;
  name: string;
  tokensCount: string;
  priceRub: number;
  pricePerToken: string;
  isActive: boolean;
  sortOrder: number;
}

interface ServicePrice {
  id: number;
  serviceName: string;
  serviceKey: string;
  tokensCost: string;
  isActive: boolean;
  sortOrder: number;
}

interface ServiceTokenRule {
  id: number;
  serviceKey: string;
  title: string;
  calcType: string;
  minArea: string | null;
  maxArea: string | null;
  tokensCost: string;
  isActive: boolean;
  sortOrder: number;
}

interface PriceHistory {
  id: number;
  entityType: string;
  entityId: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });

function useTokenPackages() {
  return useQuery<TokenPackage[]>({
    queryKey: ["/api/settings/token-packages"],
    queryFn: () => apiFetch("/api/settings/token-packages").then(r => r.json()),
  });
}

function useServicePrices() {
  return useQuery<ServicePrice[]>({
    queryKey: ["/api/settings/service-token-prices"],
    queryFn: () => apiFetch("/api/settings/service-token-prices").then(r => r.json()),
  });
}

function usePriceHistory() {
  return useQuery<PriceHistory[]>({
    queryKey: ["/api/settings/token-price-history"],
    queryFn: () => apiFetch("/api/settings/token-price-history").then(r => r.json()),
  });
}

function useServiceTokenRules() {
  return useQuery<ServiceTokenRule[]>({
    queryKey: ["/api/settings/service-token-rules"],
    queryFn: () => apiFetch("/api/settings/service-token-rules").then(r => r.json()),
  });
}

// ─── Inline edit row for packages ────────────────────────────────────────────

function PackageRow({ pkg, onSave, onDelete }: {
  pkg: TokenPackage;
  onSave: (id: number, data: Partial<TokenPackage>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pkg.name);
  const [tokens, setTokens] = useState(String(pkg.tokensCount));
  const [price, setPrice] = useState(String(pkg.priceRub));
  const [active, setActive] = useState(pkg.isActive);

  const pricePerToken = tokens && price ? (Number(price) / Number(tokens)).toFixed(0) : "—";

  const handleSave = () => {
    onSave(pkg.id, { name, tokensCount: tokens, priceRub: Number(price), isActive: active });
    setEditing(false);
  };
  const handleCancel = () => {
    setName(pkg.name);
    setTokens(String(pkg.tokensCount));
    setPrice(String(pkg.priceRub));
    setActive(pkg.isActive);
    setEditing(false);
  };

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      {editing ? (
        <>
          <td className="p-3"><input className="border rounded px-2 py-1 w-full text-sm" value={name} onChange={e => setName(e.target.value)} /></td>
          <td className="p-3"><input className="border rounded px-2 py-1 w-20 text-sm" type="number" step="0.5" value={tokens} onChange={e => setTokens(e.target.value)} /></td>
          <td className="p-3"><input className="border rounded px-2 py-1 w-28 text-sm" type="number" value={price} onChange={e => setPrice(e.target.value)} /></td>
          <td className="p-3 text-slate-500 text-sm">{Number(pricePerToken).toLocaleString("ru-RU")} ₽</td>
          <td className="p-3">
            <button onClick={() => setActive(v => !v)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-slate-300"}`}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${active ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </td>
          <td className="p-3 flex gap-2">
            <button onClick={handleSave} className="p-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600"><Check size={14} /></button>
            <button onClick={handleCancel} className="p-1.5 rounded bg-slate-200 hover:bg-slate-300"><X size={14} /></button>
          </td>
        </>
      ) : (
        <>
          <td className="p-3 font-medium text-sm">{pkg.name}</td>
          <td className="p-3 text-sm">{Number(pkg.tokensCount)} токен(а)</td>
          <td className="p-3 text-sm">{Number(pkg.priceRub).toLocaleString("ru-RU")} ₽</td>
          <td className="p-3 text-slate-500 text-sm">{Number(pkg.pricePerToken).toLocaleString("ru-RU")} ₽</td>
          <td className="p-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pkg.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {pkg.isActive ? "Активен" : "Откл."}
            </span>
          </td>
          <td className="p-3 flex gap-2">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-slate-200 text-slate-600"><Pencil size={14} /></button>
            <button onClick={() => onDelete(pkg.id)} className="p-1.5 rounded hover:bg-red-100 text-red-500"><Trash2 size={14} /></button>
          </td>
        </>
      )}
    </tr>
  );
}

// ─── Inline edit row for service prices ──────────────────────────────────────

function ServiceRow({ svc, onSave, onDelete }: {
  svc: ServicePrice;
  onSave: (id: number, data: Partial<ServicePrice>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(svc.serviceName);
  const [cost, setCost] = useState(String(svc.tokensCost));
  const [active, setActive] = useState(svc.isActive);

  const handleSave = () => {
    onSave(svc.id, { serviceName: name, tokensCost: cost, isActive: active });
    setEditing(false);
  };
  const handleCancel = () => {
    setName(svc.serviceName);
    setCost(String(svc.tokensCost));
    setActive(svc.isActive);
    setEditing(false);
  };

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      {editing ? (
        <>
          <td className="p-3"><input className="border rounded px-2 py-1 w-full text-sm" value={name} onChange={e => setName(e.target.value)} /></td>
          <td className="p-3 text-slate-400 text-xs">{svc.serviceKey}</td>
          <td className="p-3"><input className="border rounded px-2 py-1 w-20 text-sm" type="number" step="0.5" value={cost} onChange={e => setCost(e.target.value)} /></td>
          <td className="p-3">
            <button onClick={() => setActive(v => !v)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-slate-300"}`}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${active ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </td>
          <td className="p-3 flex gap-2">
            <button onClick={handleSave} className="p-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600"><Check size={14} /></button>
            <button onClick={handleCancel} className="p-1.5 rounded bg-slate-200 hover:bg-slate-300"><X size={14} /></button>
          </td>
        </>
      ) : (
        <>
          <td className="p-3 font-medium text-sm">{svc.serviceName}</td>
          <td className="p-3 text-slate-400 text-xs">{svc.serviceKey}</td>
          <td className="p-3 text-sm">{Number(svc.tokensCost)} токен(а)</td>
          <td className="p-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${svc.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {svc.isActive ? "Активна" : "Откл."}
            </span>
          </td>
          <td className="p-3 flex gap-2">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-slate-200 text-slate-600"><Pencil size={14} /></button>
            <button onClick={() => onDelete(svc.id)} className="p-1.5 rounded hover:bg-red-100 text-red-500"><Trash2 size={14} /></button>
          </td>
        </>
      )}
    </tr>
  );
}

// ─── Inline edit row for service token rules ─────────────────────────────────

function RuleRow({ rule, onSave, onDelete }: {
  rule: ServiceTokenRule;
  onSave: (id: number, data: Partial<ServiceTokenRule>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(rule.title);
  const [calcType, setCalcType] = useState(rule.calcType);
  const [minArea, setMinArea] = useState(rule.minArea ?? "");
  const [maxArea, setMaxArea] = useState(rule.maxArea ?? "");
  const [cost, setCost] = useState(String(rule.tokensCost));
  const [active, setActive] = useState(rule.isActive);

  const handleSave = () => {
    onSave(rule.id, {
      title,
      calcType,
      minArea: minArea || null,
      maxArea: maxArea || null,
      tokensCost: cost,
      isActive: active,
    });
    setEditing(false);
  };
  const handleCancel = () => {
    setTitle(rule.title);
    setCalcType(rule.calcType);
    setMinArea(rule.minArea ?? "");
    setMaxArea(rule.maxArea ?? "");
    setCost(String(rule.tokensCost));
    setActive(rule.isActive);
    setEditing(false);
  };

  const areaLabel = rule.calcType === "area_range"
    ? `${rule.minArea ?? 0}–${rule.maxArea ?? "∞"} м²`
    : rule.calcType === "fixed" ? "фикс." : "ручн.";

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      {editing ? (
        <>
          <td className="p-3"><input className="border rounded px-2 py-1 w-full text-sm" value={title} onChange={e => setTitle(e.target.value)} /></td>
          <td className="p-3">
            <select className="border rounded px-2 py-1 w-full text-sm" value={calcType} onChange={e => setCalcType(e.target.value)}>
              <option value="fixed">fixed</option>
              <option value="area_range">area_range</option>
              <option value="manual">manual</option>
            </select>
          </td>
          <td className="p-3 flex gap-1">
            <input className="border rounded px-2 py-1 w-16 text-sm" type="number" placeholder="min" value={minArea} onChange={e => setMinArea(e.target.value)} />
            <input className="border rounded px-2 py-1 w-16 text-sm" type="number" placeholder="max" value={maxArea} onChange={e => setMaxArea(e.target.value)} />
          </td>
          <td className="p-3"><input className="border rounded px-2 py-1 w-20 text-sm" type="number" step="0.5" value={cost} onChange={e => setCost(e.target.value)} /></td>
          <td className="p-3">
            <button onClick={() => setActive(v => !v)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-slate-300"}`}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${active ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </td>
          <td className="p-3 flex gap-2">
            <button onClick={handleSave} className="p-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600"><Check size={14} /></button>
            <button onClick={handleCancel} className="p-1.5 rounded bg-slate-200 hover:bg-slate-300"><X size={14} /></button>
          </td>
        </>
      ) : (
        <>
          <td className="p-3 font-medium text-sm">{rule.title}</td>
          <td className="p-3 text-slate-400 text-xs">{rule.serviceKey} · {areaLabel}</td>
          <td className="p-3 text-sm">{Number(rule.tokensCost)} токен(а)</td>
          <td className="p-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${rule.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {rule.isActive ? "Активна" : "Откл."}
            </span>
          </td>
          <td className="p-3 flex gap-2">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-slate-200 text-slate-600"><Pencil size={14} /></button>
            <button onClick={() => onDelete(rule.id)} className="p-1.5 rounded hover:bg-red-100 text-red-500"><Trash2 size={14} /></button>
          </td>
        </>
      )}
    </tr>
  );
}

// ─── Add rule form ───────────────────────────────────────────────────────────

function AddRuleForm({ onAdd, onCancel }: { onAdd: (d: any) => void; onCancel: () => void }) {
  const [serviceKey, setServiceKey] = useState("");
  const [title, setTitle] = useState("");
  const [calcType, setCalcType] = useState("area_range");
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");
  const [cost, setCost] = useState("");

  return (
    <tr className="border-b border-blue-100 bg-blue-50">
      <td className="p-3">
        <input className="border rounded px-2 py-1 w-full text-sm mb-1" placeholder="Ключ (oboi)" value={serviceKey} onChange={e => setServiceKey(e.target.value)} />
        <input className="border rounded px-2 py-1 w-full text-sm" placeholder="Название" value={title} onChange={e => setTitle(e.target.value)} />
      </td>
      <td className="p-3">
        <select className="border rounded px-2 py-1 w-full text-sm" value={calcType} onChange={e => setCalcType(e.target.value)}>
          <option value="area_range">area_range</option>
          <option value="fixed">fixed</option>
          <option value="manual">manual</option>
        </select>
      </td>
      <td className="p-3 flex gap-1">
        <input className="border rounded px-2 py-1 w-16 text-sm" type="number" placeholder="min" value={minArea} onChange={e => setMinArea(e.target.value)} />
        <input className="border rounded px-2 py-1 w-16 text-sm" type="number" placeholder="max" value={maxArea} onChange={e => setMaxArea(e.target.value)} />
      </td>
      <td className="p-3"><input className="border rounded px-2 py-1 w-20 text-sm" type="number" step="0.5" placeholder="Токены" value={cost} onChange={e => setCost(e.target.value)} /></td>
      <td className="p-3 text-slate-400 text-xs">—</td>
      <td className="p-3 flex gap-2">
        <button
          onClick={() => { if (serviceKey && title && cost) onAdd({ service_key: serviceKey, title, calc_type: calcType, min_area: minArea || null, max_area: maxArea || null, tokens_cost: cost }); }}
          className="p-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
        ><Check size={14} /></button>
        <button onClick={onCancel} className="p-1.5 rounded bg-slate-200 hover:bg-slate-300"><X size={14} /></button>
      </td>
    </tr>
  );
}

// ─── Add package form ─────────────────────────────────────────────────────────

function AddPackageForm({ onAdd, onCancel }: { onAdd: (d: any) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [tokens, setTokens] = useState("");
  const [price, setPrice] = useState("");
  const pricePerToken = tokens && price ? (Number(price) / Number(tokens)).toFixed(0) : "—";

  return (
    <tr className="border-b border-blue-100 bg-blue-50">
      <td className="p-3"><input className="border rounded px-2 py-1 w-full text-sm" placeholder="Название" value={name} onChange={e => setName(e.target.value)} /></td>
      <td className="p-3"><input className="border rounded px-2 py-1 w-20 text-sm" type="number" step="0.5" placeholder="Токены" value={tokens} onChange={e => setTokens(e.target.value)} /></td>
      <td className="p-3"><input className="border rounded px-2 py-1 w-28 text-sm" type="number" placeholder="₽" value={price} onChange={e => setPrice(e.target.value)} /></td>
      <td className="p-3 text-slate-500 text-sm">{pricePerToken !== "—" ? `${Number(pricePerToken).toLocaleString("ru-RU")} ₽` : "—"}</td>
      <td className="p-3 text-slate-400 text-xs">—</td>
      <td className="p-3 flex gap-2">
        <button
          onClick={() => { if (name && tokens && price) onAdd({ name, tokens_count: tokens, price_rub: Number(price) }); }}
          className="p-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
        ><Check size={14} /></button>
        <button onClick={onCancel} className="p-1.5 rounded bg-slate-200 hover:bg-slate-300"><X size={14} /></button>
      </td>
    </tr>
  );
}

// ─── Add service form ─────────────────────────────────────────────────────────

function AddServiceForm({ onAdd, onCancel }: { onAdd: (d: any) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [cost, setCost] = useState("");

  return (
    <tr className="border-b border-blue-100 bg-blue-50">
      <td className="p-3"><input className="border rounded px-2 py-1 w-full text-sm" placeholder="Название услуги" value={name} onChange={e => setName(e.target.value)} /></td>
      <td className="p-3"><input className="border rounded px-2 py-1 w-32 text-sm" placeholder="ключ" value={key} onChange={e => setKey(e.target.value)} /></td>
      <td className="p-3"><input className="border rounded px-2 py-1 w-20 text-sm" type="number" step="0.5" placeholder="Токены" value={cost} onChange={e => setCost(e.target.value)} /></td>
      <td className="p-3 text-slate-400 text-xs">—</td>
      <td className="p-3 flex gap-2">
        <button
          onClick={() => { if (name && key && cost) onAdd({ service_name: name, service_key: key, tokens_cost: cost }); }}
          className="p-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
        ><Check size={14} /></button>
        <button onClick={onCancel} className="p-1.5 rounded bg-slate-200 hover:bg-slate-300"><X size={14} /></button>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function fieldLabel(field: string) {
  const map: Record<string, string> = {
    name: "Название", tokens_count: "Токенов", price_rub: "Цена (₽)",
    is_active: "Активен", tokens_cost: "Стоимость", service_name: "Услуга",
  };
  return map[field] ?? field;
}

function entityLabel(type: string) {
  return type === "package" ? "Пакет" : "Услуга";
}

export default function TokenSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: packages = [], isLoading: pkgLoading } = useTokenPackages();
  const { data: services = [], isLoading: svcLoading } = useServicePrices();
  const { data: rules = [], isLoading: rulesLoading } = useServiceTokenRules();
  const { data: history = [] } = usePriceHistory();

  const [addingPkg, setAddingPkg] = useState(false);
  const [addingSvc, setAddingSvc] = useState(false);
  const [addingRule, setAddingRule] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/settings/token-packages"] });
    qc.invalidateQueries({ queryKey: ["/api/settings/service-token-prices"] });
    qc.invalidateQueries({ queryKey: ["/api/settings/service-token-rules"] });
    qc.invalidateQueries({ queryKey: ["/api/settings/token-price-history"] });
  };

  const savePkg = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await apiFetch(`/api/settings/token-packages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.name,
          tokens_count: data.tokensCount,
          price_rub: data.priceRub,
          is_active: data.isActive,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { invalidate(); toast({ title: "Тарифы обновлены" }); },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deletePkg = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/api/settings/token-packages/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { invalidate(); toast({ title: "Пакет деактивирован" }); },
  });

  const addPkg = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiFetch("/api/settings/token-packages", { method: "POST", body: JSON.stringify(data) });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { invalidate(); setAddingPkg(false); toast({ title: "Пакет добавлен" }); },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const saveSvc = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await apiFetch(`/api/settings/service-token-prices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          service_name: data.serviceName,
          tokens_cost: data.tokensCost,
          is_active: data.isActive,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { invalidate(); toast({ title: "Тарифы обновлены" }); },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteSvc = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/api/settings/service-token-prices/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { invalidate(); toast({ title: "Услуга деактивирована" }); },
  });

  const addSvc = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiFetch("/api/settings/service-token-prices", { method: "POST", body: JSON.stringify(data) });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { invalidate(); setAddingSvc(false); toast({ title: "Услуга добавлена" }); },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const saveRule = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await apiFetch(`/api/settings/service-token-rules/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          service_key: data.serviceKey,
          title: data.title,
          calc_type: data.calcType,
          min_area: data.minArea,
          max_area: data.maxArea,
          tokens_cost: data.tokensCost,
          is_active: data.isActive,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { invalidate(); toast({ title: "Правило обновлено" }); },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/api/settings/service-token-rules/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { invalidate(); toast({ title: "Правило деактивировано" }); },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const addRule = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiFetch("/api/settings/service-token-rules", { method: "POST", body: JSON.stringify(data) });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { invalidate(); setAddingRule(false); toast({ title: "Правило добавлено" }); },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  return (
    <ProtectedRoute>
      <Layout>
        <div className="max-w-5xl mx-auto p-6 space-y-8">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <Coins className="text-amber-600" size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Токены и тарифы</h1>
              <p className="text-sm text-slate-500">Пакеты покупки токенов и стоимость заявок по типам услуг</p>
            </div>
          </div>

          {/* ── Пакеты токенов ── */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Coins size={16} className="text-amber-500" />
                <h2 className="font-semibold text-slate-700">Пакеты токенов</h2>
              </div>
              <button
                onClick={() => setAddingPkg(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
              >
                <Plus size={14} /> Добавить пакет
              </button>
            </div>
            <div className="overflow-x-auto">
              {pkgLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="p-3">Название</th>
                      <th className="p-3">Токенов</th>
                      <th className="p-3">Цена</th>
                      <th className="p-3">За 1 токен</th>
                      <th className="p-3">Статус</th>
                      <th className="p-3">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map(pkg => (
                      <PackageRow
                        key={pkg.id}
                        pkg={pkg}
                        onSave={(id, data) => savePkg.mutate({ id, data })}
                        onDelete={id => deletePkg.mutate(id)}
                      />
                    ))}
                    {addingPkg && (
                      <AddPackageForm
                        onAdd={data => addPkg.mutate(data)}
                        onCancel={() => setAddingPkg(false)}
                      />
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* ── Стоимость по услугам ── */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wrench size={16} className="text-slate-500" />
                <h2 className="font-semibold text-slate-700">Стоимость заявок по типам услуг</h2>
              </div>
              <button
                onClick={() => setAddingSvc(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
              >
                <Plus size={14} /> Добавить услугу
              </button>
            </div>
            <div className="overflow-x-auto">
              {svcLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="p-3">Услуга</th>
                      <th className="p-3">Ключ</th>
                      <th className="p-3">Стоимость</th>
                      <th className="p-3">Статус</th>
                      <th className="p-3">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map(svc => (
                      <ServiceRow
                        key={svc.id}
                        svc={svc}
                        onSave={(id, data) => saveSvc.mutate({ id, data })}
                        onDelete={id => deleteSvc.mutate(id)}
                      />
                    ))}
                    {addingSvc && (
                      <AddServiceForm
                        onAdd={data => addSvc.mutate(data)}
                        onCancel={() => setAddingSvc(false)}
                      />
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* ── Правила расчёта (area-based) ── */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wrench size={16} className="text-blue-500" />
                <h2 className="font-semibold text-slate-700">Правила расчёта стоимости</h2>
              </div>
              <button
                onClick={() => setAddingRule(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
              >
                <Plus size={14} /> Добавить правило
              </button>
            </div>
            <div className="overflow-x-auto">
              {rulesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="p-3">Правило</th>
                      <th className="p-3">Тип / Ключ</th>
                      <th className="p-3">Стоимость</th>
                      <th className="p-3">Статус</th>
                      <th className="p-3">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(rule => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        onSave={(id, data) => saveRule.mutate({ id, data })}
                        onDelete={id => deleteRule.mutate(id)}
                      />
                    ))}
                    {addingRule && (
                      <AddRuleForm
                        onAdd={data => addRule.mutate(data)}
                        onCancel={() => setAddingRule(false)}
                      />
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* ── История изменений ── */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <History size={16} className="text-slate-400" />
              <h2 className="font-semibold text-slate-700">История изменений тарифов</h2>
            </div>
            {history.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">Изменений пока нет</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="p-3">Дата</th>
                      <th className="p-3">Объект</th>
                      <th className="p-3">Поле</th>
                      <th className="p-3">Было</th>
                      <th className="p-3">Стало</th>
                      <th className="p-3">Кто изменил</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-3 text-slate-500 whitespace-nowrap">
                          {new Date(h.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                            {entityLabel(h.entityType)} #{h.entityId}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600">{fieldLabel(h.fieldName)}</td>
                        <td className="p-3 text-red-500 line-through">{h.oldValue ?? "—"}</td>
                        <td className="p-3 text-emerald-600 font-medium">{h.newValue ?? "—"}</td>
                        <td className="p-3 text-slate-500">{h.changedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
