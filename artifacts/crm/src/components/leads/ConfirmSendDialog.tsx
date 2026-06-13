import { useState } from "react";
import { CheckCircle2, Loader2, Play } from "lucide-react";

interface LeadRow {
  id: number;
  clientName: string;
  clientPhone: string;
  city: string;
  district: string | null;
  serviceType: string;
}

interface ConfirmSendDialogProps {
  lead: LeadRow;
  onClose: () => void;
  onConfirm: (leadId: number, maxMasters?: number) => void;
  isPending?: boolean;
}

export default function ConfirmSendDialog({
  lead,
  onClose,
  onConfirm,
  isPending,
}: ConfirmSendDialogProps) {
  const [maxMasters, setMaxMasters] = useState<number>(3);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-primary" /></div>
          <div><h3 className="font-bold text-gray-900">Отправить мастерам?</h3><p className="text-xs text-gray-500 mt-0.5">Будет создан заказ и запущена рассылка</p></div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 mb-5 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Клиент</span><span className="font-medium text-gray-800">{lead.clientName}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Телефон</span><span className="font-medium text-gray-800">{lead.clientPhone}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Город</span><span className="font-medium text-gray-800">{lead.city}{lead.district ? `, ${lead.district}` : ""}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Услуга</span><span className="font-medium text-gray-800">{lead.serviceType}</span></div>
        </div>
        <div className="mb-4">
          <label className="text-xs text-gray-500 block mb-1">Макс. мастеров</label>
          <div className="flex gap-2">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setMaxMasters(n)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${maxMasters === n ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >{n} {n === 1 ? 'мастер' : 'мастера'}</button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-100 transition-colors text-sm">Отмена</button>
          <button onClick={() => onConfirm(lead.id, maxMasters)} disabled={isPending} className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50 transition-all text-sm">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
