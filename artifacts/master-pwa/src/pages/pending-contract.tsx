import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  FileSignature, LogOut, Camera, CheckCircle, Clock,
  Upload, Eye, EyeOff, ShieldCheck, AlertCircle, ChevronDown, ChevronUp
} from "lucide-react";

const CONTRACT_TEXT = `ДОГОВОР-ОФЕРТА
об оказании услуг по привлечению клиентов

г. Москва

ИП Козлов Игорь Александрович (далее — «Платформа»), действующий на основании свидетельства о государственной регистрации, предлагает любому физическому лицу, осуществляющему деятельность в качестве самозанятого (далее — «Исполнитель»), заключить настоящий договор-оферту (далее — «Договор») на следующих условиях.

1. ПРЕДМЕТ ДОГОВОРА

1.1. Платформа обязуется оказывать Исполнителю услуги по привлечению клиентов (заявок) на выполнение ремонтно-строительных и отделочных работ через систему «Честный Мастер».

1.2. Исполнитель принимает и оплачивает заявки в соответствии с условиями настоящего Договора.

2. УСЛОВИЯ СОТРУДНИЧЕСТВА

2.1. Платформа передаёт Исполнителю информацию о клиентских заявках через мобильное приложение «Честный Мастер» и Telegram-бот.

2.2. Исполнитель самостоятельно принимает решение о принятии или отклонении каждой заявки.

2.3. Исполнитель выполняет работы лично, от своего имени, как самозанятый, и несёт полную ответственность за качество выполненных работ перед конечным клиентом.

3. КОМИССИОННОЕ ВОЗНАГРАЖДЕНИЕ

3.1. За каждую выполненную заявку Исполнитель уплачивает Платформе комиссионное вознаграждение в следующем размере:
   • При стоимости работ до 50 000 ₽ — фиксированная комиссия 5 000 ₽;
   • При стоимости работ от 50 000 до 100 000 ₽ — 15% от суммы;
   • При стоимости работ свыше 100 000 ₽ — 20% от суммы.

3.2. Комиссия оплачивается в течение 3 (трёх) рабочих дней после завершения и оплаты заказа клиентом.

3.3. Реквизиты для оплаты комиссии: номер карты 89892860863, Альфа Банк, Игорь К.

4. ПРАВА И ОБЯЗАННОСТИ СТОРОН

4.1. Платформа обязана:
   — предоставлять Исполнителю доступ к заявкам клиентов;
   — своевременно сообщать об изменении условий сотрудничества;
   — хранить персональные данные Исполнителя в соответствии с законодательством РФ.

4.2. Исполнитель обязан:
   — соблюдать профессиональную этику при общении с клиентами;
   — выполнять принятые заявки качественно и в установленные сроки;
   — своевременно уплачивать комиссионное вознаграждение;
   — уведомлять Платформу о невозможности выполнения принятой заявки;
   — поддерживать актуальность своих данных в системе.

4.3. Исполнитель не вправе:
   — переуступать принятые заявки третьим лицам без согласования с Платформой;
   — самостоятельно привлекать клиентов Платформы в обход системы.

5. КОНФИДЕНЦИАЛЬНОСТЬ

5.1. Стороны обязуются не разглашать конфиденциальную информацию, полученную в ходе сотрудничества, третьим лицам без письменного согласия другой стороны.

6. ОТВЕТСТВЕННОСТЬ СТОРОН

6.1. Платформа не несёт ответственности за действия клиентов и конечный результат взаимодействия Исполнителя с клиентом.

6.2. Исполнитель несёт полную ответственность за качество выполненных работ, соблюдение норм безопасности и законодательства РФ.

6.3. При систематическом нарушении условий Договора Платформа вправе приостановить или прекратить доступ Исполнителя к системе.

7. СРОК ДЕЙСТВИЯ И РАСТОРЖЕНИЕ

7.1. Договор вступает в силу с момента акцепта (принятия условий) Исполнителем и действует бессрочно.

7.2. Каждая из сторон вправе расторгнуть Договор, уведомив другую сторону за 7 (семь) календарных дней.

7.3. Расторжение Договора не освобождает Исполнителя от обязанности оплатить уже начисленную комиссию.

8. АКЦЕПТ ОФЕРТЫ

8.1. Акцептом настоящей оферты является:
   — загрузка фотографии паспорта гражданина РФ;
   — подтверждение ознакомления с условиями договора в интерфейсе приложения.

8.2. С момента акцепта Договор считается заключённым и имеет полную юридическую силу.

9. РЕКВИЗИТЫ ПЛАТФОРМЫ

ИП Козлов Игорь Александрович
Телефон: +7 (989) 286-08-63
Платёжные реквизиты: 89892860863 · Альфа Банк · Игорь К.`;

type Step = "read" | "passport" | "confirm" | "done";

export default function PendingContractPage() {
  const { master, logout, refresh } = useAuth();
  const [step, setStep] = useState<Step>("read");
  const [contractExpanded, setContractExpanded] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [passportPreview, setPassportPreview] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(master?.customAvatarUrl ?? null);
  const contractRef = useRef<HTMLDivElement>(null);
  const passportInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const contractDone = master?.contractSignedAt !== null && master?.contractSignedAt !== undefined;

  useEffect(() => {
    if (contractDone) setStep("done");
  }, [contractDone]);

  const handleContractScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 40) {
      setScrolledToBottom(true);
    }
  };

  const handlePassportSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Только изображения"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Файл не более 10 МБ"); return; }
    setPassportFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPassportPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSign = async () => {
    if (!passportFile) { toast.error("Прикрепите фото паспорта"); return; }
    if (!agreed) { toast.error("Подтвердите согласие с условиями"); return; }
    setSigning(true);
    try {
      const fd = new FormData();
      fd.append("passport", passportFile);
      const res = await fetch("/api/contract/sign", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 422) {
          toast.error(`Паспорт не принят: ${data.note ?? data.error}`, { duration: 6000 });
        } else {
          toast.error(data.error ?? "Ошибка при подписании");
        }
        return;
      }
      toast.success("Договор подписан — аккаунт активирован!");
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
    if (!file.type.startsWith("image/")) { toast.error("Выберите изображение"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Файл не более 5 МБ"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/master-pwa/profile/avatar", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error();
      const { customAvatarUrl } = await res.json();
      setAvatarUrl(customAvatarUrl);
      toast.success("Фото добавлено");
    } catch {
      toast.error("Не удалось загрузить фото");
    } finally {
      setUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const initials = master?.alias?.slice(0, 2)?.toUpperCase() ?? "МС";

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8 bg-background relative overflow-hidden">
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[350px] rounded-full blur-[120px] opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(ellipse, #c4b5fd 0%, #a78bfa 50%, transparent 100%)" }} />

      <div className="w-full max-w-sm space-y-5 relative z-10">

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2.5 pt-2">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt={master?.alias} className="w-16 h-16 rounded-full object-cover shadow-md" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white text-xl font-bold shadow-md">
                {initials}
              </div>
            )}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow active:opacity-80 disabled:opacity-50"
            >
              {uploading
                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera size={12} className="text-white" />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div className="text-center">
            <h2 className="font-bold text-base">{master?.alias}</h2>
            <p className="text-xs text-muted-foreground">{master?.city}</p>
          </div>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-0">
          {(["read", "passport", "confirm", "done"] as Step[]).map((s, i, arr) => {
            const stepIndex = arr.indexOf(step);
            const isDone = i < stepIndex || step === "done";
            const isActive = s === step && step !== "done";
            const labels = ["Договор", "Паспорт", "Подписание", "Готово"];
            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isDone ? "bg-emerald-500 text-white" :
                    isActive ? "bg-primary text-white" :
                    "bg-muted border border-border text-muted-foreground"
                  }`}>
                    {isDone ? <CheckCircle size={14} /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-medium ${isActive ? "text-primary" : isDone ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {labels[i]}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div className={`h-0.5 w-6 -mt-4 ${i < stepIndex ? "bg-emerald-400" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* STEP 1 — read contract */}
        {step === "read" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setContractExpanded(x => !x)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
              >
                <span className="flex items-center gap-2">
                  <FileSignature size={16} className="text-primary" />
                  Договор-оферта
                </span>
                {contractExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {contractExpanded && (
                <div
                  ref={contractRef}
                  onScroll={handleContractScroll}
                  className="px-4 pb-4 max-h-64 overflow-y-auto text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap border-t border-border pt-3"
                >
                  {CONTRACT_TEXT}
                </div>
              )}
            </div>

            {!contractExpanded && (
              <p className="text-xs text-muted-foreground text-center">
                Раскройте договор и прочитайте перед подписанием
              </p>
            )}

            <button
              onClick={() => {
                setScrolledToBottom(true);
                setStep("passport");
              }}
              className="w-full h-12 bg-primary text-white font-semibold rounded-xl active:opacity-80 transition-opacity flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} />
              Ознакомлен, продолжить
            </button>
          </div>
        )}

        {/* STEP 2 — passport photo */}
        {step === "passport" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldCheck size={18} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Фото паспорта РФ</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Сфотографируйте разворот с фото и личными данными. Фото проверяется ИИ автоматически — убедитесь, что оно чёткое и не закрыто рукой.
                  </p>
                </div>
              </div>

              {passportPreview ? (
                <div className="relative rounded-xl overflow-hidden aspect-video bg-muted">
                  <img src={passportPreview} alt="Паспорт" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setPassportFile(null); setPassportPreview(null); }}
                    className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full"
                  >
                    Изменить
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => passportInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-primary/40 rounded-xl py-8 flex flex-col items-center gap-2 active:opacity-80 bg-primary/5"
                >
                  <Upload size={24} className="text-primary" />
                  <span className="text-sm font-medium text-primary">Выбрать фото</span>
                  <span className="text-xs text-muted-foreground">JPG, PNG — до 10 МБ</span>
                </button>
              )}
              <input
                ref={passportInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePassportSelect}
              />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                Данные паспорта используются исключительно для оформления договора и хранятся в зашифрованном виде.
              </p>
            </div>

            <button
              onClick={() => passportFile ? setStep("confirm") : passportInputRef.current?.click()}
              disabled={!passportFile}
              className="w-full h-12 bg-primary text-white font-semibold rounded-xl active:opacity-80 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
            >
              Далее
            </button>
            <button onClick={() => setStep("read")} className="w-full text-center text-xs text-muted-foreground py-1">
              ← Назад к договору
            </button>
          </div>
        )}

        {/* STEP 3 — confirm + sign */}
        {step === "confirm" && (
          <div className="space-y-4">
            {passportPreview && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 overflow-hidden">
                <div className="px-4 py-2.5 flex items-center gap-2 border-b border-emerald-200">
                  <CheckCircle size={14} className="text-emerald-600" />
                  <p className="text-xs font-semibold text-emerald-800">Фото прикреплено</p>
                </div>
                <div className="aspect-video relative">
                  <img src={passportPreview} alt="Паспорт" className="w-full h-full object-cover" />
                </div>
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer select-none rounded-xl border border-border bg-card p-3">
              <div
                onClick={() => setAgreed(v => !v)}
                className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors ${
                  agreed ? "bg-primary border-primary" : "border-border"
                }`}
              >
                {agreed && <CheckCircle size={12} className="text-white" />}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Я ознакомился с условиями договора-оферты, принимаю их в полном объёме и подтверждаю, что прикреплённый документ — мой паспорт гражданина РФ.
              </p>
            </label>

            <button
              onClick={handleSign}
              disabled={!agreed || signing}
              className="w-full h-12 bg-primary text-white font-bold rounded-xl active:opacity-80 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
            >
              {signing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Проверяем паспорт...
                </>
              ) : (
                <>
                  <FileSignature size={16} />
                  Подписать договор
                </>
              )}
            </button>
            <button onClick={() => setStep("passport")} className="w-full text-center text-xs text-muted-foreground py-1">
              ← Назад
            </button>
          </div>
        )}

        {/* STEP 4 — done */}
        {step === "done" && (
          <div className="space-y-4 text-center">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={32} className="text-emerald-500" />
              </div>
              <h3 className="font-bold text-lg text-emerald-700">Договор подписан!</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ваш аккаунт активирован. Теперь вы можете принимать заявки.
              </p>
            </div>
            <button
              onClick={refresh}
              className="w-full h-12 bg-primary text-white font-semibold rounded-xl active:opacity-80"
            >
              Перейти в приложение
            </button>
          </div>
        )}

        {step !== "done" && (
          <button
            onClick={logout}
            className="w-full text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5 py-1"
          >
            <LogOut size={12} />
            Выйти
          </button>
        )}
      </div>
    </div>
  );
}
