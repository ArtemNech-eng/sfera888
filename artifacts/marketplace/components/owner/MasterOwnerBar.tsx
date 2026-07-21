"use client";

import { useEffect, useState } from "react";
import { deriveHeaderSession } from "../../lib/headerSession";
import { matchesMaster } from "../../lib/ownerMode";
import { OwnerBar } from "./OwnerBar";

/**
 * Owner_Mode detector for `/master/{slug}` (real-price 5.4, Req 10.2).
 *
 * After hydration, resolves the logged-in master via `/api/cabinet/auth/me` and
 * compares it to the profile owner's id (available in the public master DTO).
 * When they match, renders the floating owner bar with inline edit entry-points
 * into the cabinet. Anonymous / non-owner visitors render nothing.
 */
export function MasterOwnerBar({ ownerMasterId }: { ownerMasterId: number }) {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cabinet/auth/me", {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (cancelled || !res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        const session = deriveHeaderSession(data);
        if (session.status === "master" && matchesMaster(session.master.id, ownerMasterId)) {
          setIsOwner(true);
        }
      } catch {
        // Upstream unreachable → treat as anonymous, no bar.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerMasterId]);

  if (!isOwner) return null;

  return (
    <OwnerBar
      label="Это ваш профиль"
      actions={[
        { href: "/cabinet/profile", label: "Редактировать профиль", primary: true },
        { href: "/cabinet/objects", label: "Мои Объекты" },
      ]}
    />
  );
}
