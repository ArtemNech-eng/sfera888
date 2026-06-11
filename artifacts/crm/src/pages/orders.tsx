/**
 * /orders page — thin wrapper around the OrdersWorkspace component.
 *
 * The same workspace is also embedded inside /leads?tab=work. Keeping a
 * dedicated /orders route lets admins use a focused full-screen view
 * and preserves any existing bookmarks.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import OrdersWorkspace from "@/components/orders/OrdersWorkspace";
import OrderPanel from "@/components/leads/OrderPanel";

export default function Orders() {
  const [, setLocation] = useLocation();
  const [openDispatchId, setOpenDispatchId] = useState<number | null>(null);

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="orders">
      <Layout>
        <OrdersWorkspace
          onOpenOrder={setOpenDispatchId}
          initialFolder="waiting_master"
          showTitle
        />
        {openDispatchId && (
          <OrderPanel
            key={openDispatchId}
            orderId={openDispatchId}
            onClose={() => setOpenDispatchId(null)}
            onOpenMasterChat={(masterId) => setLocation(`/master-chat?masterId=${masterId}`)}
            onNavigateToTasks={(orderId) => setLocation(`/tasks?newOrder=${orderId}`)}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
}
