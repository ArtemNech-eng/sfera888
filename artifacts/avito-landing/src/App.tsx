import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Loader2,
  MapPin,
  Ruler,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

// По умолчанию — относительный путь: страница и API на одном домене, CORS не
// участвует. При размещении на отдельном домене задайте VITE_API_BASE_URL.
const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/+$/, "");

const SERVICE_CHIPS = [
  "Укладка плитки",
  "Поклейка обоев",
  "Покраска стен",
  "Монтаж ламината",
  "Штукатурка стен",
  "Электромонтаж",
  "Сантехника",
  "Натяжные потолки",
  "Комплексный ремонт",
];

type Status = "idle" | "sending" | "done";

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

export default function App() {
  const [cities, setCities] = useState<string[]>([]);
  const [citiesLoaded, setCitiesLoaded] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState("");
  const [services, setServices] = useState<string[]>([]);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/landing/cities`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad_status"))))
      .then((data: { cities?: string[] }) => {
        if (cancelled) return;
        const list = Array.isArray(data.cities) ? data.cities : [];
        setCities(list);
        if (list.length === 1) setCity(list[0]);
        setCitiesLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setCities([]);
        setCitiesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Метки рекламной кампании: для каждого объявления на Авито можно завести
  // свою ссылку и потом видеть в CRM, какое из них приносит заявки.
  const tracking = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source") ?? "avito",
      utm_medium: params.get("utm_medium") ?? undefined,
      utm_campaign: params.get("utm_campaign") ?? undefined,
      utm_term: params.get("utm_term") ?? undefined,
      utm_content: params.get("utm_content") ?? undefined,
      referrer: document.referrer || undefined,
    };
  }, []);

  const toggleService = (service: string) => {
    setServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const validate = (): string | null => {
    if (name.trim().length < 2) return "Напишите, как к вам обращаться";
    if (digitsOf(phone).length < 10) return "Проверьте номер телефона";
    if (city.trim().length < 1) return "Выберите город";
    if (address.trim().length < 3) return "Укажите адрес объекта";
    if (description.trim().length < 5) return "Коротко опишите, что нужно сделать";
    return null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "sending") return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setStatus("sending");

    try {
      const response = await fetch(`${API_BASE}/api/landing/quick-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          city: city.trim(),
          address: address.trim(),
          description: description.trim(),
          area: area.trim() === "" ? undefined : Number(area),
          services,
          ...tracking,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          setError("Слишком часто. Подождите несколько секунд и попробуйте снова.");
        } else {
          setError("Не удалось отправить заявку. Попробуйте ещё раз.");
        }
        setStatus("idle");
        return;
      }

      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Нет связи с сервером. Проверьте интернет и попробуйте снова.");
      setStatus("idle");
    }
  };

  const inputClass =
    "w-full rounded-xl border hairline bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/12";
  const labelClass = "mb-1.5 block text-[13px] font-semibold text-slate-700";

  return (
    <div className="surface-page min-h-screen w-full px-4 py-7 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[560px]">
        <header className="mb-6 text-center">
          <span className="chip-glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold tracking-wide text-emerald-50">
            <BadgeCheck className="h-3.5 w-3.5" />
            Частные мастера вашего города
          </span>

          <h1 className="mt-4 text-[28px] font-extrabold leading-[1.15] tracking-tight text-white sm:text-[34px]">
            Ремонтные работы
            <br />
            <span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
              недорого и без посредников
            </span>
          </h1>

          <p className="mx-auto mt-3 max-w-[430px] text-[14px] leading-relaxed text-emerald-100/80">
            Оставьте заявку — и получите предложения по стоимости сразу от нескольких
            свободных мастеров. Сравните и выберите своего.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { icon: Wallet, label: "Недорого" },
              { icon: Users, label: "Несколько цен" },
              { icon: ShieldCheck, label: "Проверенные" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="chip-glass flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center"
              >
                <Icon className="h-4 w-4 text-emerald-300" />
                <span className="text-[12px] font-semibold leading-tight text-emerald-50">{label}</span>
              </div>
            ))}
          </div>
        </header>

        {status === "done" ? (
          <section className="card-premium rounded-3xl px-6 py-12 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h2 className="mt-5 text-[22px] font-extrabold text-slate-900">Заявка принята</h2>
            <p className="mx-auto mt-2.5 max-w-[380px] text-[14px] leading-relaxed text-slate-600">
              Мастера уже получили её. Свободные откликнутся и свяжутся с вами, чтобы
              назвать стоимость. Обычно это занимает от 15 минут.
            </p>
            <p className="mt-5 text-[13px] text-slate-400">Держите телефон под рукой.</p>
          </section>
        ) : (
          <section className="card-premium rounded-3xl p-5 sm:p-7">
            <form onSubmit={handleSubmit} noValidate>
              <div className="grid gap-4">
                <div>
                  <label className={labelClass} htmlFor="name">
                    Как к вам обращаться
                  </label>
                  <input
                    id="name"
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Имя"
                    autoComplete="name"
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="phone">
                    Телефон для связи
                  </label>
                  <input
                    id="phone"
                    className={inputClass}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 900 000-00-00"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="city">
                    Город
                  </label>
                  {citiesLoaded && cities.length > 0 ? (
                    <select
                      id="city"
                      className={inputClass}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    >
                      <option value="">Выберите город</option>
                      {cities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="city"
                      className={inputClass}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ваш город"
                      autoComplete="address-level2"
                    />
                  )}
                </div>

                <div>
                  <label className={labelClass} htmlFor="address">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                      Адрес объекта
                    </span>
                  </label>
                  <input
                    id="address"
                    className={inputClass}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Улица, дом, квартира"
                    autoComplete="street-address"
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="description">
                    Что нужно сделать
                  </label>
                  <textarea
                    id="description"
                    className={`${inputClass} min-h-[92px] resize-y`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Например: поклеить обои в двух комнатах, стены подготовлены"
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="area">
                    <span className="inline-flex items-center gap-1.5">
                      <Ruler className="h-3.5 w-3.5 text-emerald-600" />
                      Примерная площадь, м²
                    </span>
                  </label>
                  <input
                    id="area"
                    className={inputClass}
                    value={area}
                    onChange={(e) => setArea(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="Необязательно"
                    inputMode="decimal"
                  />
                </div>

                <div>
                  <span className={labelClass}>Вид работ — если знаете</span>
                  <div className="flex flex-wrap gap-1.5">
                    {SERVICE_CHIPS.map((service) => {
                      const active = services.includes(service);
                      return (
                        <button
                          key={service}
                          type="button"
                          onClick={() => toggleService(service)}
                          className={
                            active
                              ? "rounded-full border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition"
                              : "rounded-full border hairline bg-slate-50 px-3 py-1.5 text-[12.5px] font-medium text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700"
                          }
                        >
                          {service}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {error && (
                <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "sending"}
                className="cta-glow mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-4 text-[15px] font-bold text-white transition hover:from-emerald-500 hover:to-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Отправляем…
                  </>
                ) : (
                  "Узнать стоимость от нескольких мастеров"
                )}
              </button>

              <p className="mt-3 text-center text-[11.5px] leading-relaxed text-slate-400">
                Бесплатно и ни к чему не обязывает. Отправляя заявку, вы соглашаетесь на
                обработку персональных данных.
              </p>
            </form>
          </section>
        )}

        <footer className="mt-6 text-center text-[12px] text-emerald-100/50">
          Работаем с проверенными частными мастерами вашего города
        </footer>
      </div>
    </div>
  );
}
