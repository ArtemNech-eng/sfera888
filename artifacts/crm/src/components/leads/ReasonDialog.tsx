import { Ban, Loader2, UserX } from "lucide-react";
import { useState, useEffect } from "react";

interface LeadRow {
  id: number;
  clientName: string;
  orderId: number | null;
}

interface ReasonDialogProps {
  lead: LeadRow;
  targetStatus: "non_target" | "client_refusal";
  onClose: () => void;
  onConfirm: (leadId: number, targetStatus: string, reason?: string) => void;
  isPending?: boolean;
}

export default function ReasonDialog({
  lead,
  targetStatus,
  onClose,
  onConfirm,
  isPending,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    setReason("");
  }, [lead.id, targetStatus]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${targetStatus === "non_target" ? "bg-orange-100" : "bg-red-100"}`}>
            {targetStatus === "non_target" ? <Ban className="w-5 h-5 text-orange-600" /> : <UserX className="w-5 h-5 text-red-600" />}
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{targetStatus === "non_target" ? "Нецелевая заявка" : "Отказ клиента"}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Заказ #{lead.orderId ?? lead.id} · {lead.clientName}</p>
          </div>
        </div>
        <div className="space-y-3 mb-5">
          <label className="text-sm font-medium text-gray-700">Причина <span className="text-gray-400 font-normal">(необязательно)</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={targetStatus === "non_target" ? "Не тот тип работ, регион не обслуживаем..." : "Нашёл другого исполнителя, слишком дорого..."}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none resize-none text-sm transition-all"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-100 transition-colors text-sm">Отмена</button>
          <button
            onClick={() => { onConfirm(lead.id, targetStatus, reason || undefined); }}
            disabled={isPending}
            className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all text-sm ${targetStatus === "non_target" ? "bg-orange-500 hover:bg-orange-600" : "bg-red-500 hover:bg-red-600"}`}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}
