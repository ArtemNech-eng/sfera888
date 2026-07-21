"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileSignature, LogOut, Camera, CheckCircle, Upload,
  ShieldCheck, AlertCircle, ChevronDown, ChevronUp, UserRound,
} from "lucide-react";
import {
  cabinetAuth,
  cabinetContract,
  cabinetProfile,
  type ContractSignInput,
} from "../_lib/cabinetClient";
import { resolvePhotoUrl } from "../_lib/photo";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "read" | "data" | "passport" | "confirm" | "done";

interface PassportData {
  fullName: string;
  passportNumber: string;
  passportDate: string;
  passportIssuer: string;
  address: string;
}

interface MasterInfo {
  id: number;
  alias: string;
  city: string;
  phone: string | null;
  customAvatarUrl?: string | null;
  contractSignedAt?: string | null;
}

// ─── Contract text builder ────────────────────────────────────────────────────

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

1.3. Мастер получает доступ к контактным данным Клиента (имя, телефон, адрес, описание работ) после отклика на заявку и её подтверждения в системе Платформы.

1.4. Персональные данные клиентов становятся доступны Мастеру для исполнения заявки. Мастер самостоятельно несёт ответственность за обработку полученных персональных данных в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. КОМИССИЯ И ПОРЯДОК РАСЧЁТОВ

2.1. За предоставление доступа к заявкам и информационное сопровождение Мастер уплачивает Платформе комиссию в следующем размере:
- фиксированная сумма 5 000 (пять тысяч) рублей — если сумма заказа (сметы) не превышает 50 000 (пятьдесят тысяч) рублей;
- 15 (пятнадцать) процентов от суммы заказа (сметы) — если сумма заказа превышает 50 000 (пятьдесят тысяч) рублей.

2.2. Клиент оплачивает выполненные работы напрямую Мастеру. Платформа не участвует в расчётах между Клиентом и Мастером.

2.3. Мастер обязан уплатить комиссию Платформе в течение 3 (трёх) календарных дней после получения оплаты от Клиента или после подтверждения выполнения работ.

2.4. Платформа вправе удержать комиссию из будущих выплат или перечислений Мастеру при наличии технической возможности и согласия Мастера.

2.5. При неуплате комиссии в установленный срок Платформа вправе приостановить доступ к новым заявкам до полного погашения задолженности.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. ТЕСТОВЫЙ ПЕРИОД И БРОНЬ

3.1. Компания вправе предоставить Исполнителю 1–2 тестовых заказа для оценки качества сотрудничества.

3.2. В случае заключения договора с клиентом по тестовому заказу Исполнитель оплачивает комиссию согласно условиям настоящего договора.

3.3. Если по результатам тестовых заказов сотрудничество признаётся неэффективным для одной из сторон, Компания вправе прекратить передачу новых заказов без объяснения причин.

3.4. Если выполнение работ по объекту осуществляется поэтапно, комиссия Компании также выплачивается поэтапно пропорционально фактически полученным Исполнителем денежным средствам от Заказчика.

3.5. При получении первого платежа от Заказчика Исполнитель обязан внести предусмотренную бронь объекта в размере 5 000 (пять тысяч) рублей через мобильное приложение.

3.6. Оставшаяся часть комиссии выплачивается по мере поступления последующих платежей от Заказчика до полного исполнения обязательств по объекту.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. СМЕТА И ПОДТВЕРЖДЕНИЕ ОПЛАТЫ

4.1. Мастер обязан согласовать с Клиентом смету и внести данные о смете в систему Платформы в течение 48 (сорока восьми) часов с момента назначения на заявку.

4.2. После согласования сметы Мастер направляет Клиенту счёт на предоплату. Мастер обязан подтвердить в системе получение предоплаты либо выполнение работ.

4.3. Отсутствие сметы в течение 48 часов или неподтверждение оплаты в течение 72 часов является основанием для эскалации заявки в статус «Проблема».

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. БЛОКИРОВКА ДОСТУПА

5.1. При наличии непогашенной задолженности система автоматически ограничивает Мастеру доступ к новым заявкам.

5.2. Платформа вправе приостановить доступ в случае систематического отказа, нарушения правил, жалоб клиентов или непогашения задолженности в течение 3 (трёх) дней.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6. ПЕРСОНАЛЬНЫЕ ДАННЫЕ

6.1. Мастер предоставляет Платформе копию паспорта и контактные данные для идентификации и заключения договора.

6.2. Мастер даёт согласие Платформе на обработку своих персональных данных для исполнения договора.

6.3. Платформа не передаёт персональные данные клиентов третьим лицам.

6.4. Мастер обязуется не использовать персональные данные клиентов в иных целях.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

7. ОТВЕТСТВЕННОСТЬ СТОРОН

7.1. Платформа не несёт ответственности за качество работ Мастера.

7.2. Мастер несёт полную материальную и юридическую ответственность перед Клиентом.

7.3. За нарушение условий Платформа вправе расторгнуть договор в одностороннем порядке.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

8. УРЕГУЛИРОВАНИЕ СПОРОВ

8.1. Споры решаются путём переговоров. Претензионный порядок — 10 календарных дней.

8.2. При недостижении соглашения — суд по месту нахождения Исполнителя (г. Краснодар).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

9. ФОРС-МАЖОР

9.1. Стороны освобождаются от ответственности вследствие обстоятельств непреодолимой силы.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

10. СРОК ДЕЙСТВИЯ И РАСТОРЖЕНИЕ

10.1. Договор вступает в силу с момента электронного акцепта и действует до полного исполнения обязательств.

10.2. Любая из Сторон вправе расторгнуть договор письменно с уведомлением за 7 календарных дней.

10.3. При расторжении Мастер обязан погасить задолженность по комиссии в полном объёме.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

11. ПРОЧИЕ УСЛОВИЯ

11.1. Мастер обязуется не привлекать Клиентов напрямую в обход Платформы в течение 12 месяцев.

11.2. Мастер обязуется не употреблять алкоголь и иные одурманивающие вещества на объекте Клиента.

11.3. Мастер обязуется соблюдать правила работы на объекте.

11.4. Платформа вправе вносить изменения в условия путём публикации новых условий на сайте.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Мастер: ${data.fullName || "______________________"}
Подписано электронно: ${dateStr}, IP: (при подписании)

Исполнитель: ИП Коваленко Игорь Геннадьевич
ОГРНИП / ИНН: указываются при необходимости`;
}

// ─── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = "pending_contract_state";

function loadSavedState(): { step: Step; data: PassportData } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState(step: Step, data: PassportData) {
  try {
    if (step === "done") { sessionStorage.removeItem(SESSION_KEY); return; }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ step, data }));
  } catch {}
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputCls =
  "w-full h-11 px-4 rounded-xl border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)]";

const STEPS: Step[] = ["read", "data", "passport", "confirm", "done"];
const STEP_LABELS = ["Договор", "Данные", "Паспорт", "Подписание", "Готово"];

// ─── Component ────────────────────────────────────────────────────────────────

export function PendingContractView() {
  const router = useRouter();

  const [master, setMaster] = useState<MasterInfo | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [uploading, setUploading] = useState(false);

  const saved = typeof window !== "undefined" ? loadSavedState() : null;
  const [step, setStepRaw] = useState<Step>(saved?.step ?? "read");
  const [contractExpanded, setContractExpanded] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [passportPreview, setPassportPreview] = useState<string | null>(null);
  const [passportRegFile, setPassportRegFile] = useState<File | null>(null);
  const [passportRegPreview, setPassportRegPreview] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [data, setData] = useState<PassportData>(
    saved?.data ?? { fullName: "", passportNumber: "", passportDate: "", passportIssuer: "", address: "" }
  );
  const [dataErrors, setDataErrors] = useState<Partial<PassportData>>({});

  const passportInputRef = useRef<HTMLInputElement>(null);
  const passportRegInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Fetch master data once on mount
  useEffect(() => {
    cabinetAuth.me().then((me) => {
      const m = me as MasterInfo & { contractSignedAt?: string | null };
      setMaster(m);
      setAvatarUrl(m.customAvatarUrl ?? null);
      if (m.contractSignedAt) setStepRaw("done");
    }).catch(() => {});
  }, []);

  const setStep = (s: Step) => {
    setStepRaw(s);
    saveState(s, data);
  };

  // Persist data changes to sessionStorage (iOS camera page-reload)
  useEffect(() => {
    if (step !== "done") saveState(step, data);
  }, [data, step]);

  // Poll auth/me every 8 seconds to detect admin activation
  useEffect(() => {
    const interval = setInterval(() => {
      cabinetAuth.me().then((me) => {
        const m = me as { status?: string; contractSignedAt?: string | null };
        if (m.status === "active") {
          router.push("/cabinet");
          router.refresh();
        }
        if (m.contractSignedAt && step !== "done") setStepRaw("done");
      }).catch(() => {});
    }, 8_000);
    return () => clearInterval(interval);
  }, [step, router]);

  // If restored to "confirm" but files lost (page reload) → back to passport
  useEffect(() => {
    if (step === "confirm" && !passportFile && !passportRegFile) {
      setStep("passport");
      toast("Загрузите фото паспорта заново — страница обновилась");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File) => void,
    setPreview: (s: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Только изображения"); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("Файл не более 15 МБ"); return; }
    setFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    if (e.target) e.target.value = "";
  };

  const handleSign = async () => {
    if (!passportFile) { toast.error("Прикрепите фото разворота паспорта"); return; }
    if (!passportRegFile) { toast.error("Прикрепите фото страницы прописки"); return; }
    if (!agreed) { toast.error("Подтвердите согласие с условиями"); return; }
    setSigning(true);
    try {
      const input: ContractSignInput = {
        passport: passportFile,
        passportReg: passportRegFile,
        fullName: data.fullName.trim(),
        passportNumber: data.passportNumber.trim(),
        passportDate: data.passportDate.trim(),
        passportIssuer: data.passportIssuer.trim(),
        address: data.address.trim(),
      };
      await cabinetContract.sign(input);
      toast.success("Договор подписан! Ожидайте подтверждения администратора.");
      setStep("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка при подписании";
      toast.error(msg, { duration: 8000 });
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
      const { customAvatarUrl } = await cabinetProfile.uploadAvatar(file);
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

  const handleLogout = async () => {
    try { await cabinetAuth.logout(); } catch {}
    router.push("/login");
  };

  const initials = master?.alias?.slice(0, 2)?.toUpperCase() ?? "МС";
  const stepIndex = STEPS.indexOf(step);
  const resolvedAvatar = avatarUrl ? resolvePhotoUrl(avatarUrl) : null;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8 bg-[var(--color-background)] relative overflow-hidden">
      {/* Ambient gradient */}
      <div
        className="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[350px] rounded-full blur-[120px] opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(ellipse, #c4b5fd 0%, #a78bfa 50%, transparent 100%)" }}
      />

      <div className="w-full max-w-sm space-y-5 relative z-10">

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2.5 pt-2">
          <div className="relative">
            {resolvedAvatar && !avatarError ? (
              <img
                src={resolvedAvatar}
                alt={master?.alias}
                className="w-16 h-16 rounded-full object-cover shadow-md"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {initials}
              </div>
            )}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-2 border-[var(--color-background)] flex items-center justify-center shadow active:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {uploading
                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera size={12} className="text-white" />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div className="text-center">
            <h2 className="font-bold text-base text-[var(--color-text)]">{master?.alias ?? "—"}</h2>
            <p className="text-xs text-[var(--color-muted)]">{master?.city}</p>
          </div>
        </div>

        {/* Step progress */}
        <div className="flex items-start">
          {STEPS.map((s, i) => {
            const isDone = i < stepIndex || step === "done";
            const isActive = s === step && step !== "done";
            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isDone
                        ? "bg-emerald-500 text-white"
                        : isActive
                        ? "text-white"
                        : "bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-muted)]"
                    }`}
                    style={isActive ? { backgroundColor: "var(--color-primary)" } : undefined}
                  >
                    {isDone ? <CheckCircle size={14} /> : i + 1}
                  </div>
                  <span
                    className={`text-[10px] font-medium text-center ${
                      isActive ? "text-[var(--color-primary)]"
                      : isDone ? "text-emerald-600"
                      : "text-[var(--color-muted)]"
                    }`}
                  >
                    {STEP_LABELS[i]}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 w-4 -mt-4 ${i < stepIndex ? "bg-emerald-400" : "bg-[var(--color-border)]"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* STEP: read contract */}
        {step === "read" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white overflow-hidden">
              <button
                onClick={() => setContractExpanded(x => !x)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--color-text)]"
              >
                <span className="flex items-center gap-2">
                  <FileSignature size={16} style={{ color: "var(--color-primary)" }} />
                  Договор № {String(master?.id ?? 0).padStart(3, "0")}
                </span>
                {contractExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {contractExpanded && (
                <div className="px-4 pb-4 max-h-72 overflow-y-auto text-xs text-[var(--color-muted)] leading-relaxed whitespace-pre-wrap border-t border-[var(--color-border)] pt-3">
                  {contractText}
                </div>
              )}
            </div>

            {!contractExpanded && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 flex items-start gap-2">
                <AlertCircle size={14} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">Раскройте договор выше, ознакомьтесь с условиями. На следующем шаге введёте паспортные данные.</p>
              </div>
            )}

            <button
              onClick={() => setStep("data")}
              className="w-full h-12 font-semibold rounded-xl active:opacity-80 text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              Ознакомлен, продолжить
            </button>
          </div>
        )}

        {/* STEP: passport data */}
        {step === "data" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 space-y-4">
              <div className="flex items-center gap-2">
                <UserRound size={16} style={{ color: "var(--color-primary)" }} />
                <p className="text-sm font-semibold text-[var(--color-text)]">Личные данные для договора</p>
              </div>

              <div className="space-y-3">
                {([
                  { key: "fullName" as const, label: "ФИО полностью", placeholder: "Иванов Иван Иванович" },
                  { key: "passportNumber" as const, label: "Серия и номер паспорта", placeholder: "4521 123456" },
                  { key: "passportDate" as const, label: "Дата выдачи паспорта", placeholder: "15.06.2015" },
                  { key: "passportIssuer" as const, label: "Кем выдан", placeholder: "УМВД России по г. Краснодар" },
                  { key: "address" as const, label: "Адрес проживания", placeholder: "г. Краснодар, ул. Ленина, д. 1, кв. 10" },
                ] as const).map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium text-[var(--color-muted)]">{label} *</label>
                    <input
                      value={data[key]}
                      onChange={e => { setData(d => ({ ...d, [key]: e.target.value })); setDataErrors(er => ({ ...er, [key]: "" })); }}
                      className={`${inputCls} ${dataErrors[key] ? "border-red-400 ring-1 ring-red-400" : ""}`}
                      placeholder={placeholder}
                    />
                    {dataErrors[key] && <p className="text-xs text-red-500">{dataErrors[key]}</p>}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => { if (validateData()) setStep("passport"); }}
              className="w-full h-12 font-semibold rounded-xl active:opacity-80 text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              Далее — загрузить паспорт
            </button>
            <button onClick={() => setStep("read")} className="w-full text-center text-xs text-[var(--color-muted)] py-1">
              ← Назад к договору
            </button>
          </div>
        )}

        {/* STEP: passport photos */}
        {step === "passport" && (
          <div className="space-y-4">
            {/* Main spread */}
            <PassportUploadCard
              title="Разворот с фотографией"
              hint="Страницы 2–3: слева ваше фото и подпись, справа — серия, номер, ФИО, дата рождения, дата выдачи. Фото должно быть чётким."
              uploadLabel="Загрузить разворот"
              preview={passportPreview}
              onClear={() => { setPassportFile(null); setPassportPreview(null); }}
              inputRef={passportInputRef}
              onChange={e => handleFileSelect(e, setPassportFile, setPassportPreview)}
            />

            {/* Registration page */}
            <PassportUploadCard
              title="Страница прописки"
              hint="Страница 5 со штампом регистрации по месту жительства. Адрес и дата регистрации должны быть читаемы."
              uploadLabel="Загрузить прописку"
              preview={passportRegPreview}
              onClear={() => { setPassportRegFile(null); setPassportRegPreview(null); }}
              inputRef={passportRegInputRef}
              onChange={e => handleFileSelect(e, setPassportRegFile, setPassportRegPreview)}
            />

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                Фото проверяет ИИ автоматически. Данные хранятся в зашифрованном виде и используются только для оформления договора.
              </p>
            </div>

            <button
              onClick={() => (passportFile && passportRegFile) ? setStep("confirm") : toast.error("Загрузите оба фото паспорта")}
              disabled={!passportFile || !passportRegFile}
              className="w-full h-12 font-semibold rounded-xl active:opacity-80 disabled:opacity-40 text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              Далее
            </button>
            <button onClick={() => setStep("data")} className="w-full text-center text-xs text-[var(--color-muted)] py-1">
              ← Назад
            </button>
          </div>
        )}

        {/* STEP: confirm + sign */}
        {step === "confirm" && (
          <div className="space-y-4">
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

            <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--color-muted)]">Данные в договоре:</p>
              <p className="text-xs text-[var(--color-text)]"><span className="text-[var(--color-muted)]">ФИО:</span> {data.fullName}</p>
              <p className="text-xs text-[var(--color-text)]"><span className="text-[var(--color-muted)]">Паспорт:</span> {data.passportNumber}, выдан {data.passportDate}</p>
              <p className="text-xs text-[var(--color-text)]"><span className="text-[var(--color-muted)]">Кем выдан:</span> {data.passportIssuer}</p>
              <p className="text-xs text-[var(--color-text)]"><span className="text-[var(--color-muted)]">Адрес:</span> {data.address}</p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none rounded-xl border border-[var(--color-border)] bg-white p-3">
              <div
                onClick={() => setAgreed(v => !v)}
                className="mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors"
                style={agreed ? { backgroundColor: "var(--color-primary)", borderColor: "var(--color-primary)" } : { borderColor: "var(--color-border)" }}
              >
                {agreed && <CheckCircle size={12} className="text-white" />}
              </div>
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                Я ознакомился с условиями договора-оферты, принимаю их в полном объёме и подтверждаю, что прикреплённый документ является моим паспортом гражданина РФ, а указанные данные верны.
              </p>
            </label>

            <button
              onClick={handleSign}
              disabled={!agreed || signing}
              className="w-full h-12 font-bold rounded-xl active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-2 text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {signing ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Проверяем паспорт...</>
              ) : (
                <><FileSignature size={16} />Подписать договор</>
              )}
            </button>
            <button onClick={() => setStep("passport")} className="w-full text-center text-xs text-[var(--color-muted)] py-1">
              ← Назад
            </button>
          </div>
        )}

        {/* STEP: done */}
        {step === "done" && (
          <div className="space-y-4 text-center">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={32} className="text-emerald-500" />
              </div>
              <h3 className="font-bold text-lg text-emerald-700">Договор подписан!</h3>
              <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                Ваши данные и фото паспорта переданы на проверку администратору.
                После подтверждения вы автоматически получите доступ к заявкам — страница обновится сама.
              </p>
            </div>
            <button
              onClick={() => router.refresh()}
              className="w-full h-12 font-semibold rounded-xl active:opacity-80 text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              Ожидать подтверждения
            </button>
          </div>
        )}

        {/* Logout */}
        {step !== "done" && (
          <button
            onClick={handleLogout}
            className="w-full text-center text-xs text-[var(--color-muted)] flex items-center justify-center gap-1.5 py-1"
          >
            <LogOut size={12} />
            Выйти
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Passport upload card ─────────────────────────────────────────────────────

function PassportUploadCard({
  title, hint, uploadLabel, preview, onClear, inputRef, onChange,
}: {
  title: string;
  hint: string;
  uploadLabel: string;
  preview: string | null;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ShieldCheck size={18} className="shrink-0 mt-0.5" style={{ color: "var(--color-primary)" }} />
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {title} <span style={{ color: "var(--color-primary)" }}>*</span>
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{hint}</p>
        </div>
      </div>

      {preview ? (
        <div className="relative rounded-xl overflow-hidden aspect-video bg-gray-100">
          <img src={preview} alt={title} className="w-full h-full object-cover" />
          <button
            onClick={onClear}
            className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full"
          >
            Изменить
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed rounded-xl py-7 flex flex-col items-center gap-2 active:opacity-80"
          style={{ borderColor: "color-mix(in srgb, var(--color-primary) 40%, transparent)", backgroundColor: "color-mix(in srgb, var(--color-primary) 5%, white)" }}
        >
          <Upload size={22} style={{ color: "var(--color-primary)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>{uploadLabel}</span>
          <span className="text-xs text-[var(--color-muted)]">JPG, PNG — до 15 МБ</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  );
}
