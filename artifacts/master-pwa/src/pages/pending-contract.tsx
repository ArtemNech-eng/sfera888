import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  FileSignature, LogOut, Camera, CheckCircle, Upload, ShieldCheck,
  ShieldAlert, AlertCircle, ChevronDown, ChevronUp, UserRound
} from "lucide-react";

type Step = "data" | "read" | "passport" | "confirm" | "done";

interface PassportData {
  fullName: string;
  passportNumber: string;
  passportDate: string;
  passportIssuer: string;
  address: string;
}

function buildContractText(data: PassportData, phone: string, masterId: number): string {
  const now = new Date();
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} г.`;
  const contractNum = String(masterId).padStart(3, "0");

  return `ДОГОВОР № ${contractNum}  г. Краснодар  ${dateStr}
Договор об оказании информационных услуг и предоставлении доступа к заявкам клиентов

ИП Коваленко Игорь Геннадьевич, действующий на основании государственной регистрации (далее — «Исполнитель» или «Платформа»), с одной стороны, и гражданин(ка) ${data.fullName || "______________________"}, ${data.passportNumber || "___ ___ ___________"}, ${data.passportDate || "_______________"} ${data.passportIssuer || "______________________________"}, проживающий(ая) по адресу: ${data.address || "______________________________"}, ${phone || "_______________"}, (далее — «Мастер»), с другой стороны, совместно — «Стороны», заключили настоящий договор о нижеследующем.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ПРЕДМЕТ ДОГОВОРА

1.1. Исполнитель предоставляет Мастеру доступ к заявкам клиентов через автоматизированную информационную систему Платформы. Заявки размещаются клиентами добровольно и самостоятельно.

1.2. Платформа не является стороной сделки между Мастером и Клиентом. Платформа не гарантирует объём заказов, доход Мастера и результат работ. Мастер самостоятельно несёт ответственность перед Клиентом за качество работ.

1.3. Мастер получает доступ к контактным данным Клиента (имя, телефон, адрес, описание работ) только после оплаты токенами в порядке, установленном настоящим договором.

1.4. Персональные данные клиентов становятся доступны Мастеру после оплаты токенами. Мастер самостоятельно несёт ответственность за обработку полученных персональных данных в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. ТОКЕНЫ И ПОРЯДОК ОПЛАТЫ

2.1. Внутренняя валюта Платформы — токены. Токены не являются денежным знаком, не подлежат обмену на наличные деньги и не передаются третьим лицам.

2.2. Мастер приобретает токены через личный кабинет или у менеджера Платформы. Пополнение баланса происходит за безналичный расчёт.

2.3. За доступ к заявке (получение контактных данных клиента) с баланса Мастера списывается стоимость в токенах. Стоимость заявки определяется автоматизированной системой на основании вида работ, города, района, времени суток, загруженности и других факторов.

2.4. Минимальная стоимость заявки составляет 2 (два) токена. Актуальная стоимость токена, а также стоимость конкретной заявки уточняются на сайте Платформы или у менеджера.

2.5. Мастер не платит комиссию или вознаграждение после выполнения работ. Все расчёты между Мастером и Платформой производятся исключительно в токеновой системе до момента получения контактных данных.

2.6. Клиент оплачивает выполненные работы напрямую Мастеру. Платформа не участвует в расчётах между Клиентом и Мастером.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. ТЕСТОВЫЙ ПЕРИОД И КРЕДИТНЫЙ ЛИМИТ

3.1. Новым Мастерам Платформа может предоставить тестовый период: доступ к ограниченному количеству заявок без предварительной оплаты или с отрицательным балансом в пределах установленного кредитного лимита.

3.2. Размер тестового периода и кредитного лимита устанавливается Платформой индивидуально и может быть изменён в одностороннем порядке.

3.3. По исчерпании тестового периода или кредитного лимита доступ к новым заявкам автоматически блокируется до пополнения баланса токенами.

3.4. Использование кредитного лимита не освобождает Мастера от обязанности погасить образовавшуюся задолженность в токенах.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. БЛОКИРОВКА ДОСТУПА

4.1. При отрицательном балансе токенов (превышении кредитного лимита) система автоматически ограничивает Мастеру доступ к новым заявкам.

4.2. Платформа вправе приостановить доступ к заявкам в случае:
- систематического отказа от принятых заявок без уведомления;
- нарушения правил работы на объекте (в том числе употребление алкоголя);
- жалоб клиентов на качество работ;
- непогашения задолженности по токенам в течение 3 календарных дней.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. ПЕРСОНАЛЬНЫЕ ДАННЫЕ

5.1. Мастер предоставляет Платформе копию паспорта (главный разворот и страницу с пропиской) и контактные данные для идентификации и заключения договора.

5.2. Мастер даёт согласие Платформе на обработку своих персональных данных в объёме, необходимом для исполнения настоящего договора.

5.3. Платформа не передаёт и не распространяет персональные данные клиентов третьим лицам. Клиенты самостоятельно размещают заявки с указанием своих данных. Мастер получает доступ к этой информации только после оплаты токенами.

5.4. Мастер обязуется не использовать персональные данные клиентов в целях, не связанных с исполнением заявки, и не передавать их третьим лицам.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6. ОТВЕТСТВЕННОСТЬ СТОРОН

6.1. Платформа не несёт ответственности за качество работ Мастера, срыв сроков, претензии Клиентов и иные последствия, возникшие при исполнении заявки.

6.2. Мастер несёт полную материальную и юридическую ответственность перед Клиентом за выполненные работы.

6.3. За нарушение условий настоящего договора Платформа вправе расторгнуть договор в одностороннем порядке.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

7. УРЕГУЛИРОВАНИЕ СПОРОВ

7.1. Споры решаются путём переговоров. Претензионный порядок — 10 календарных дней.

7.2. При недостижении соглашения — суд по месту нахождения Исполнителя (г. Краснодар).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

8. ФОРС-МАЖОР

8.1. Стороны освобождаются от ответственности за неисполнение обязательств вследствие обстоятельств непреодолимой силы.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

9. СРОК ДЕЙСТВИЯ И РАСТОРЖЕНИЕ

9.1. Договор вступает в силу с момента электронного акцепта (подписание в PWA / скрин согласия) и действует до полного исполнения обязательств.

9.2. Любая из Сторон вправе расторгнуть договор письменно с уведомлением за 7 календарных дней.

9.3. При расторжении Мастер обязан погасить задолженность по токенам в полном объёме.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

10. ПРОЧИЕ УСЛОВИЯ

10.1. Мастер обязуется не привлекать Клиентов, полученных через Платформу, напрямую в обход Платформы в течение 12 месяцев после последнего контакта.

10.2. Мастер обязуется не употреблять алкогольные напитки и иные одурманивающие вещества на объекте Клиента. Нарушение — основание для немедленного расторжения.

10.3. Мастер обязуется соблюдать правила работы на объекте: приезжать вовремя, при опоздании предупреждать за 2 часа, работать аккуратно, убирать за собой.

10.4. Платформа вправе вносить изменения в условия предоставления доступа к заявкам (в том числе стоимость в токенах) путём публикации новых условий на сайте. Продолжение использования Платформы означает согласие с изменениями.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Мастер: ${data.fullName || "______________________"}
Подписано электронно: ${dateStr}, IP: (при подписании)

Исполнитель: ИП Коваленко Игорь Геннадьевич
ОГРНИП / ИНН: указываются при необходимости`;
}

const inputCls = "w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const STEPS: Step[] = ["read", "data", "passport", "confirm", "done"];
const STEP_LABELS = ["Договор", "Данные", "Паспорт", "Подписание", "Готово"];

const SESSION_KEY = "pending_contract_state";

function loadSavedState(): { step: Step; data: PassportData } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(step: Step, data: PassportData) {
  try {
    if (step === "done") { sessionStorage.removeItem(SESSION_KEY); return; }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ step, data }));
  } catch {}
}

export default function PendingContractPage() {
  const { master, logout, refresh } = useAuth();
  const contractDone = !!(master as any)?.contractSignedAt;
  const saved = loadSavedState();
  const [step, setStepRaw] = useState<Step>(() => {
    if (contractDone) return "done";
    return saved?.step ?? "read";
  });
  const [contractExpanded, setContractExpanded] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [passportPreview, setPassportPreview] = useState<string | null>(null);
  const [passportRegFile, setPassportRegFile] = useState<File | null>(null);
  const [passportRegPreview, setPassportRegPreview] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(master?.customAvatarUrl ?? null);
  const [avatarError, setAvatarError] = useState(false);
  const [data, setData] = useState<PassportData>(saved?.data ?? {
    fullName: "", passportNumber: "", passportDate: "",
    passportIssuer: "", address: "",
  });
  const [dataErrors, setDataErrors] = useState<Partial<PassportData>>({});

  const setStep = (s: Step) => {
    setStepRaw(s);
    saveState(s, data);
  };

  const passportInputRef = useRef<HTMLInputElement>(null);
  const passportRegInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Sync if contractDone becomes true while component is mounted (e.g. from polling)
  useEffect(() => { if (contractDone) setStepRaw("done"); }, [contractDone]);

  // If restored to "confirm" step but files were lost (page reload), go back to passport step
  useEffect(() => {
    if (step === "confirm" && !passportFile && !passportRegFile) {
      setStep("passport");
      toast("Загрузите фото паспорта заново — страница обновилась");
    }
  }, []); // run once on mount only

  // Persist data changes to sessionStorage so iOS camera page-reload doesn't reset the form
  useEffect(() => {
    if (step !== "done") saveState(step, data);
  }, [data, step]);

  // Poll /auth/me every 8 seconds so the PWA detects admin activation.
  // Continues on "done" step so auto-redirect to "/" fires as soon as admin activates.
  useEffect(() => {
    const interval = setInterval(() => { refresh(); }, 8_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const contractText = buildContractText(data, master?.phone ?? "", master?.id ?? 0);

  const validateData = () => {
    const errs: Partial<PassportData> = {};
    if (!data.fullName.trim()) errs.fullName = "Обязательно";
    if (!data.passportNumber.trim()) errs.passportNumber = "Обязательно";
    if (!data.passportDate.trim()) errs.passportDate = "Обязательно";
    if (!data.passportIssuer.trim()) errs.passportIssuer = "Обязательно";
    if (!data.address.trim()) errs.address = "Обязательно";
    setDataErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePassportSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Только изображения"); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("Файл не более 15 МБ"); return; }
    setPassportFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPassportPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    if (e.target) e.target.value = "";
  };

  const handlePassportRegSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Только изображения"); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("Файл не более 15 МБ"); return; }
    setPassportRegFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPassportRegPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    if (e.target) e.target.value = "";
  };

  const handleSign = async () => {
    if (!passportFile) { toast.error("Прикрепите фото разворота паспорта (страницы с фото)"); return; }
    if (!passportRegFile) { toast.error("Прикрепите фото страницы прописки"); return; }
    if (!agreed) { toast.error("Подтвердите согласие с условиями"); return; }
    setSigning(true);
    try {
      const fd = new FormData();
      fd.append("passport", passportFile);
      fd.append("passportReg", passportRegFile);
      fd.append("fullName", data.fullName.trim());
      fd.append("passportNumber", data.passportNumber.trim());
      fd.append("passportDate", data.passportDate.trim());
      fd.append("passportIssuer", data.passportIssuer.trim());
      fd.append("address", data.address.trim());

      const res = await fetch("/api/contract/sign", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 422) {
          toast.error(`Паспорт не принят: ${json.note ?? json.error}`, { duration: 8000 });
        } else {
          toast.error(json.error ?? "Ошибка при подписании");
        }
        return;
      }
      toast.success("Договор подписан! Ожидайте подтверждения администратора.");
      setStep("done");
      await refresh();
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSigning(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Файл не более 5 МБ"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/master-pwa/profile/avatar", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error();
      const { customAvatarUrl } = await res.json();
      setAvatarUrl(customAvatarUrl);
      setAvatarError(false);
      toast.success("Фото добавлено");
    } catch {
      toast.error("Не удалось загрузить фото");
    } finally {
      setUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const initials = master?.alias?.slice(0, 2)?.toUpperCase() ?? "МС";
  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8 bg-background relative overflow-hidden">
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[350px] rounded-full blur-[120px] opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(ellipse, #c4b5fd 0%, #a78bfa 50%, transparent 100%)" }} />

      <div className="w-full max-w-sm space-y-5 relative z-10">

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2.5 pt-2">
          <div className="relative">
            {avatarUrl && !avatarError
              ? <img
                  src={avatarUrl}
                  alt={master?.alias}
                  className="w-16 h-16 rounded-full object-cover shadow-md"
                  onError={() => { setAvatarError(true); }}
                />
              : <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold shadow-md">{initials}</div>}
            <button onClick={() => avatarInputRef.current?.click()} disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow active:opacity-80 disabled:opacity-50">
              {uploading
                ? <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                : <Camera size={12} className="text-primary-foreground" />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div className="text-center">
            <h2 className="font-bold text-base">{master?.alias}</h2>
            <p className="text-xs text-muted-foreground">{master?.city}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-start">
          {STEPS.map((s, i) => {
            const isDone = i < stepIndex || step === "done";
            const isActive = s === step && step !== "done";
            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isDone ? "bg-emerald-500 text-white" : isActive ? "bg-primary text-primary-foreground" : "bg-muted border border-border text-muted-foreground"
                  }`}>
                    {isDone ? <CheckCircle size={14} /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-medium text-center ${isActive ? "text-primary" : isDone ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {STEP_LABELS[i]}
                  </span>
                </div>
                {i < STEPS.length - 1 && <div className={`h-0.5 w-4 -mt-4 ${i < stepIndex ? "bg-emerald-400" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>

        {/* STEP 1 — passport data */}
        {step === "data" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <UserRound size={16} className="text-primary" />
                <p className="text-sm font-semibold">Личные данные для договора</p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">ФИО полностью *</label>
                  <input
                    value={data.fullName}
                    onChange={e => { setData(d => ({ ...d, fullName: e.target.value })); setDataErrors(er => ({ ...er, fullName: "" })); }}
                    className={`${inputCls} ${dataErrors.fullName ? "border-red-400 ring-1 ring-red-400" : ""}`}
                    placeholder="Иванов Иван Иванович"
                  />
                  {dataErrors.fullName && <p className="text-xs text-red-500">{dataErrors.fullName}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Серия и номер паспорта *</label>
                  <input
                    value={data.passportNumber}
                    onChange={e => { setData(d => ({ ...d, passportNumber: e.target.value })); setDataErrors(er => ({ ...er, passportNumber: "" })); }}
                    className={`${inputCls} ${dataErrors.passportNumber ? "border-red-400 ring-1 ring-red-400" : ""}`}
                    placeholder="4521 123456"
                  />
                  {dataErrors.passportNumber && <p className="text-xs text-red-500">{dataErrors.passportNumber}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Дата выдачи паспорта *</label>
                  <input
                    value={data.passportDate}
                    onChange={e => { setData(d => ({ ...d, passportDate: e.target.value })); setDataErrors(er => ({ ...er, passportDate: "" })); }}
                    className={`${inputCls} ${dataErrors.passportDate ? "border-red-400 ring-1 ring-red-400" : ""}`}
                    placeholder="15.06.2015"
                  />
                  {dataErrors.passportDate && <p className="text-xs text-red-500">{dataErrors.passportDate}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Кем выдан *</label>
                  <input
                    value={data.passportIssuer}
                    onChange={e => { setData(d => ({ ...d, passportIssuer: e.target.value })); setDataErrors(er => ({ ...er, passportIssuer: "" })); }}
                    className={`${inputCls} ${dataErrors.passportIssuer ? "border-red-400 ring-1 ring-red-400" : ""}`}
                    placeholder="УМВД России по г. Краснодар"
                  />
                  {dataErrors.passportIssuer && <p className="text-xs text-red-500">{dataErrors.passportIssuer}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Адрес проживания *</label>
                  <input
                    value={data.address}
                    onChange={e => { setData(d => ({ ...d, address: e.target.value })); setDataErrors(er => ({ ...er, address: "" })); }}
                    className={`${inputCls} ${dataErrors.address ? "border-red-400 ring-1 ring-red-400" : ""}`}
                    placeholder="г. Краснодар, ул. Ленина, д. 1, кв. 10"
                  />
                  {dataErrors.address && <p className="text-xs text-red-500">{dataErrors.address}</p>}
                </div>
              </div>
            </div>

            <button
              onClick={() => { if (validateData()) setStep("passport"); }}
              className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-xl active:opacity-80"
            >
              Далее — загрузить паспорт
            </button>
            <button onClick={() => setStep("read")} className="w-full text-center text-xs text-muted-foreground py-1">
              ← Назад к договору
            </button>
          </div>
        )}

        {/* STEP 2 — read filled contract */}
        {step === "read" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setContractExpanded(x => !x)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
              >
                <span className="flex items-center gap-2">
                  <FileSignature size={16} className="text-primary" />
                  Договор № {String(master?.id ?? 0).padStart(3, "0")}
                </span>
                {contractExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {contractExpanded && (
                <div className="px-4 pb-4 max-h-72 overflow-y-auto text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap border-t border-border pt-3">
                  {contractText}
                </div>
              )}
            </div>

            {!contractExpanded && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 flex items-start gap-2">
                <AlertCircle size={14} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">Раскройте договор выше, ознакомьтесь с условиями. На следующем шаге введёте свои паспортные данные.</p>
              </div>
            )}

            <button
              onClick={() => setStep("data")}
              className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-xl active:opacity-80"
            >
              Ознакомлен, продолжить
            </button>
          </div>
        )}

        {/* STEP 3 — passport photos */}
        {step === "passport" && (
          <div className="space-y-4">

            {/* Main spread — photo page */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldCheck size={18} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Разворот с фотографией <span className="text-primary">*</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Страницы 2–3: слева ваше фото и подпись, справа — серия, номер, ФИО, дата рождения, дата выдачи. Фото должно быть чётким.
                  </p>
                </div>
              </div>

              {passportPreview ? (
                <div className="relative rounded-xl overflow-hidden aspect-video bg-muted">
                  <img src={passportPreview} alt="Разворот паспорта" className="w-full h-full object-cover" />
                  <button onClick={() => { setPassportFile(null); setPassportPreview(null); }}
                    className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full">
                    Изменить
                  </button>
                </div>
              ) : (
                <button onClick={() => passportInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-primary/40 rounded-xl py-7 flex flex-col items-center gap-2 active:opacity-80 bg-primary/5">
                  <Upload size={22} className="text-primary" />
                  <span className="text-sm font-medium text-primary">Загрузить разворот</span>
                  <span className="text-xs text-muted-foreground">JPG, PNG — до 15 МБ</span>
                </button>
              )}
              <input ref={passportInputRef} type="file" accept="image/*"
                className="hidden" onChange={handlePassportSelect} />
            </div>

            {/* Registration page — прописка */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldCheck size={18} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Страница прописки <span className="text-primary">*</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Страница 5 со штампом регистрации по месту жительства. Адрес и дата регистрации должны быть читаемы.
                  </p>
                </div>
              </div>

              {passportRegPreview ? (
                <div className="relative rounded-xl overflow-hidden aspect-video bg-muted">
                  <img src={passportRegPreview} alt="Страница прописки" className="w-full h-full object-cover" />
                  <button onClick={() => { setPassportRegFile(null); setPassportRegPreview(null); }}
                    className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full">
                    Изменить
                  </button>
                </div>
              ) : (
                <button onClick={() => passportRegInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-primary/40 rounded-xl py-7 flex flex-col items-center gap-2 active:opacity-80 bg-primary/5">
                  <Upload size={22} className="text-primary" />
                  <span className="text-sm font-medium text-primary">Загрузить прописку</span>
                  <span className="text-xs text-muted-foreground">JPG, PNG — до 15 МБ</span>
                </button>
              )}
              <input ref={passportRegInputRef} type="file" accept="image/*"
                className="hidden" onChange={handlePassportRegSelect} />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                Фото проверяет ИИ автоматически. Данные хранятся в зашифрованном виде и используются только для оформления договора.
              </p>
            </div>

            <button
              onClick={() => (passportFile && passportRegFile) ? setStep("confirm") : toast.error("Загрузите оба фото паспорта")}
              disabled={!passportFile || !passportRegFile}
              className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-xl active:opacity-80 disabled:opacity-40">
              Далее
            </button>
            <button onClick={() => setStep("data")} className="w-full text-center text-xs text-muted-foreground py-1">
              ← Назад
            </button>
          </div>
        )}

        {/* STEP 4 — confirm + sign */}
        {step === "confirm" && (
          <div className="space-y-4">
            {/* Both passport photos */}
            {(passportPreview || passportRegPreview) && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 overflow-hidden">
                <div className="px-4 py-2.5 flex items-center gap-2 border-b border-emerald-200">
                  <CheckCircle size={14} className="text-emerald-600" />
                  <p className="text-xs font-semibold text-emerald-800">Фото паспорта прикреплены</p>
                </div>
                <div className="grid grid-cols-2 divide-x divide-emerald-200">
                  {passportPreview && (
                    <div className="aspect-video">
                      <img src={passportPreview} alt="Разворот" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {passportRegPreview && (
                    <div className="aspect-video">
                      <img src={passportRegPreview} alt="Прописка" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 divide-x divide-emerald-200 bg-emerald-100/50">
                  <p className="text-[10px] text-emerald-700 text-center py-1">Разворот с фото</p>
                  <p className="text-[10px] text-emerald-700 text-center py-1">Страница прописки</p>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground">Данные в договоре:</p>
              <p className="text-xs"><span className="text-muted-foreground">ФИО:</span> {data.fullName}</p>
              <p className="text-xs"><span className="text-muted-foreground">Паспорт:</span> {data.passportNumber}, выдан {data.passportDate}</p>
              <p className="text-xs"><span className="text-muted-foreground">Кем выдан:</span> {data.passportIssuer}</p>
              <p className="text-xs"><span className="text-muted-foreground">Адрес:</span> {data.address}</p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none rounded-xl border border-border bg-card p-3">
              <div onClick={() => setAgreed(v => !v)}
                className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors ${agreed ? "bg-primary border-primary" : "border-border"}`}>
                {agreed && <CheckCircle size={12} className="text-primary-foreground" />}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Я ознакомился с условиями договора-оферты, принимаю их в полном объёме и подтверждаю, что прикреплённый документ является моим паспортом гражданина РФ, а указанные данные верны.
              </p>
            </label>

            <button onClick={handleSign} disabled={!agreed || signing}
              className="w-full h-12 bg-primary text-primary-foreground font-bold rounded-xl active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-2">
              {signing ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Проверяем паспорт...</>
              ) : (
                <><FileSignature size={16} />Подписать договор</>
              )}
            </button>
            <button onClick={() => setStep("passport")} className="w-full text-center text-xs text-muted-foreground py-1">
              ← Назад
            </button>
          </div>
        )}

        {/* STEP 5 — done */}
        {step === "done" && (
          <div className="space-y-4 text-center">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={32} className="text-emerald-500" />
              </div>
              <h3 className="font-bold text-lg text-emerald-700">Договор подписан!</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ваши данные и фото паспорта переданы на проверку администратору.
                После подтверждения вы автоматически получите доступ к заявкам — страница обновится сама.
              </p>
            </div>
            <button onClick={refresh} className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-xl active:opacity-80">
              Ожидать подтверждения
            </button>
          </div>
        )}

        {step !== "done" && (
          <button onClick={logout} className="w-full text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5 py-1">
            <LogOut size={12} />
            Выйти
          </button>
        )}
      </div>
    </div>
  );
}
