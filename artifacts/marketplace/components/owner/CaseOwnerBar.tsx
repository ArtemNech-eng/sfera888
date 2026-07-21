"use client";

import { useEffect, useState } from "react";
import { deriveHeaderSession } from "../../lib/headerSession";
import {
  matchesMaster,
  findOwnedObjectBySlug,
  caseEditHref,
  type OwnedObjectLite,
} from "../../lib/ownerMode";
import { OwnerBar } from "./OwnerBar";

/**
 * Owner_Mode detector for `/raboty/{slug}` (real-price 5.4, Req 10.2).
 *
 * The public object DTO omits masterId (privacy, Req 9), so ownership of an
 * object case is decided by MEMBERSHIP: the slug appears in the master's own
 * `/api/cabinet/objects` list, which also gives the `orderId` for the edit
 * deep-link and the publish status. For legacy portfolio cases (which expose an
 * owner master id but aren't in the objects list) we fall back to an id match
 * via `/api/cabinet/auth/me`.
 *
 * Anonymous / non-owner visitors render nothing.
 */
type OwnerState =
  | { kind: "none" }
  | { kind: "object"; object: OwnedObjectLite }
  | { kind: "legacy" };

export function CaseOwnerBar({
  slug,
  ownerMasterId,
}: {
  slug: string;
  ownerMasterId?: number | null;
}) {
  const [state, setState] = useState<OwnerState>({ kind: "none" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Primary: is this slug one of my objects?
        const res = await fetch("/api/cabinet/objects", {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!cancelled && res.ok) {
          const items = (await res.json().catch(() => null)) as
            | OwnedObjectLite[]
            | null;
          const match = Array.isArray(items) ? findOwnedObjectBySlug(items, slug) : null;
          if (!cancelled && match) {
            setState({ kind: "object", object: match });
            return;
          }
        }

        // Fallback for legacy portfolio pages: match by owner master id.
        if (!cancelled && typeof ownerMasterId === "number") {
          const me = await fetch("/api/cabinet/auth/me", {
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json" },
          });
          if (!cancelled && me.ok) {
            const session = deriveHeaderSession(await me.json().catch(() => null));
            if (
              !cancelled &&
              session.status === "master" &&
              matchesMaster(session.master.id, ownerMasterId)
            ) {
              setState({ kind: "legacy" });
            }
          }
        }
      } catch {
        // Anonymous / upstream error → no bar.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, ownerMasterId]);

  if (state.kind === "object") {
    return (
      <OwnerBar
        label="Это ваш объект"
        status={state.object.isPublished ? "Опубликован" : "Черновик"}
        actions={[
          { href: caseEditHref(state.object.orderId), label: "Редактировать", primary: true },
          { href: "/cabinet/objects", label: "Мои Объекты" },
        ]}
      />
    );
  }

  if (state.kind === "legacy") {
    return (
      <OwnerBar
        label="Это ваша работа"
        actions={[{ href: "/cabinet/objects", label: "Мои Объекты", primary: true }]}
      />
    );
  }

  return null;
}
