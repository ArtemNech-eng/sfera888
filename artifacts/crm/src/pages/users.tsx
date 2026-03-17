import { useState } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute, useAuth } from "@/hooks/use-auth";
import { useGetUsers, useCreateUser, useDeleteUser, CreateUserRequestRole } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, Loader2, User as UserIcon, KeyRound, Eye, EyeOff, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

const roleMap: Record<string, { label: string; class: string }> = {
  admin: { label: "Администратор", class: "bg-purple-100 text-purple-800" },
  lead_operator: { label: "Оператор заявок", class: "bg-blue-100 text-blue-800" },
  master_operator: { label: "Оператор мастеров", class: "bg-emerald-100 text-emerald-800" },
};

function ChangePasswordModal({ userId, userName, onClose }: {
  userId: number;
  userName: string;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Минимум 6 символов"); return; }
    if (password !== confirm) { setError("Пароли не совпадают"); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/users/${userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Ошибка");
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (e: any) {
      setError(e.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display font-bold text-foreground">Сменить пароль</h2>
            <p className="text-sm text-muted-foreground">{userName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Новый пароль</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                className="w-full px-3 py-2 pr-10 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
              <button type="button" onClick={() => setShow(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Повторите пароль</label>
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Ещё раз"
              className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          {error && <p className="text-sm text-destructive font-medium">{error}</p>}
          {success && <p className="text-sm text-emerald-600 font-medium">Пароль успешно изменён</p>}
          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-slate-100">
              Отмена
            </button>
            <button type="submit" disabled={loading || success}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useGetUsers();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [changePwdUser, setChangePwdUser] = useState<{ id: number; name: string } | null>(null);

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        setIsCreateOpen(false);
      }
    }
  });
  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users"] })
    }
  });

  const [formData, setFormData] = useState({
    login: "",
    password: "",
    name: "",
    role: CreateUserRequestRole.lead_operator
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData });
  };

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <Layout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Пользователи</h1>
              <p className="text-muted-foreground mt-1">Управление доступом операторов</p>
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
            >
              <Plus className="w-4 h-4" /> Добавить пользователя
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full py-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : users?.map(u => (
              <div key={u.id} className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                      <UserIcon className="w-6 h-6 text-slate-500" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-lg leading-tight">{u.name}</h3>
                      <p className="text-sm text-muted-foreground">@{u.login}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setChangePwdUser({ id: u.id, name: u.name })}
                      title="Сменить пароль"
                      className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-colors"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => {
                          if (confirm("Вы уверены?")) deleteMutation.mutate({ id: u.id });
                        }}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${roleMap[u.role]?.class ?? ""}`}>
                    {roleMap[u.role]?.label ?? u.role}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Добавлен: {formatDate(u.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Create Modal */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h2 className="text-lg font-display font-bold text-foreground">Новый пользователь</h2>
                <button onClick={() => setIsCreateOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">ФИО</label>
                  <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Логин</label>
                  <input required value={formData.login} onChange={e => setFormData({ ...formData, login: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Пароль</label>
                  <input required type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Роль</label>
                  <select required value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as CreateUserRequestRole })} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background">
                    <option value={CreateUserRequestRole.lead_operator}>Оператор заявок</option>
                    <option value={CreateUserRequestRole.master_operator}>Оператор мастеров</option>
                    <option value={CreateUserRequestRole.admin}>Администратор</option>
                  </select>
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-slate-100">Отмена</button>
                  <button type="submit" disabled={createMutation.isPending} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 flex items-center gap-2">
                    {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Создать
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Change Password Modal */}
        {changePwdUser && (
          <ChangePasswordModal
            userId={changePwdUser.id}
            userName={changePwdUser.name}
            onClose={() => setChangePwdUser(null)}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
}
