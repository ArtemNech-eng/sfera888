const BASE = "/api/master-pwa";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Ошибка запроса");
  }
  return res.json();
}

export const api = {
  auth: {
    login: (login: string, password: string) =>
      req<any>("POST", "/auth/login", { login, password }),
    me: () => req<any>("GET", "/auth/me"),
    logout: () => req<any>("POST", "/auth/logout"),
  },
  home: () => req<any>("GET", "/home"),
  orders: {
    available: () => req<any>("GET", "/orders/available"),
    my: (filter?: string) => req<any>("GET", `/orders/my${filter ? `?filter=${filter}` : ""}`),
    accept: (id: number) => req<any>("POST", `/orders/${id}/accept`),
    reject: (id: number) => req<any>("POST", `/orders/${id}/reject`),
    updateStatus: (id: number, masterWorkStatus: string) =>
      req<any>("PATCH", `/orders/${id}/status`, { masterWorkStatus }),
    addPhoto: (id: number, type: string, url: string) =>
      req<any>("PATCH", `/orders/${id}/photos`, { type, url }),
    complete: (id: number, proposedAmount: number) =>
      req<any>("POST", `/orders/${id}/complete`, { proposedAmount }),
  },
  balance: () => req<any>("GET", "/balance"),
  profile: () => req<any>("GET", "/profile"),
  admin: {
    setCredentials: (masterId: number, login: string, password: string) =>
      fetch(`${BASE}/admin/set-credentials/${masterId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login, password }),
      }).then(r => r.json()),
  },
};

export async function uploadPhoto(file: File): Promise<string> {
  const urlRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!urlRes.ok) throw new Error("Ошибка получения URL загрузки");
  const { uploadURL, objectPath } = await urlRes.json();
  await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return objectPath;
}
