"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

// Браузер ходит в api-server напрямую. Это осознанно, а не от лени: прокси
// через route handler подменил бы IP клиента на IP сервера, а лимит частоты
// на стороне api-server считается по IP — один отправивший заявку блокировал
// бы всех остальных. Кросс-доменный запрос здесь разрешён: origin
// chestnye-mastera.ru уже перечислен в getAllowedOrigins() api-server'а.
const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://sfera-master.ru"
).replace(/\/+$/, "");

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

function normalizeForSearch(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

export function QuickLeadForm() {
  const [cities, setCities] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [cityTouched, setCityTouched] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState("");
  const [services, setServices] = useState<string[]>([]);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const cityInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_ORIGIN}/api/landing/cities`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad_status"))))
      .then((data: { cities?: string[] }) => {
        if (cancelled) return;
        const list = Array.isArray(data.cities) ? data.cities : [];
        setCities(list);
        if (list.length === 1 && list[0]) setCity(list[0]);
      })
      .catch(() => {
        // Список городов — подсказка, а не блокер: поле остаётся обычным вводом.
        if (!cancelled) setCities([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Метки кампании: для каждого объявления на Авито можно завести свою ссылку
  // с ?utm_campaign=… и потом видеть в CRM, какое из них приносит заявки.
  const tracking = useMemo(() => {
    if (typeof window === "undefined") return {};
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

  // Совпадение города со списком — не косметика: рассылка ищет мастеров точным
  // сравнением строки, поэтому «г. Ставрополь» не найдёт никого.
  const cityConfirmed = useMemo(
    () => cities.some((c) => normalizeForSearch(c) === normalizeForSearch(city)),
    [cities, city],
  );

  const citySuggestions = useMemo(() => {
    if (cities.length === 0) return [];
    const query = normalizeForSearch(city);
    if (query === "") return cities.slice(0, 6);
    if (cityConfirmed) return [];
    const starts = cities.filter((c) => normalizeForSearch(c).startsWith(query));
    const contains = cities.filter(
      (c) => !normalizeForSearch(c).startsWith(query) && normalizeForSearch(c).includes(query),
    );
    return [...starts, ...contains].slice(0, 6);
  }, [cities, city, cityConfirmed]);

  const toggleService = (service: string) => {
    setServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service],
    );
  };

  const pickCity = (value: string) => {
    setCity(value);
    setSuggestOpen(false);
    setCityTouched(true);
    cityInputRef.current?.blur();
  };

  const validate = (): string | null => {
    if (name.trim().length < 2) return "Напишите, как к вам обращаться";
    if (digitsOf(phone).length < 10) return "Проверьте номер телефона";
    if (city.trim().length < 1) return "Укажите город";
    if (address.trim().length < 3) return "Укажите адрес объекта";
    if (description.trim().length < 5) return "Коротко опишите, что нужно сделать";
    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
      const response = await fetch(`${API_ORIGIN}/api/landing/quick-leads`, {
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
        setError(
          response.status === 429
            ? "Слишком часто. Подождите несколько секунд и попробуйте снова."
            : "Не удалось отправить заявку. Попробуйте ещё раз.",
        );
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
    "w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-[16px] text-[var(--color-text)] outline-none transition placeholder:text-black/35 focus:border-[var(--color-cta)] focus:ring-4 focus:ring-[var(--color-cta)]/12";
  const labelClass = "mb-1.5 block text-[13px] font-semibold text-[var(--color-text)]";

  const cityLabel = cityConfirmed ? city.trim() : "вашего города";

  if (status === "done") {
    return (
      <div className="min-h-screen w-full bg-[linear-gradient(180deg,#FFF7F4_0%,#FAFAF8_60%,#F4F5F2_100%)] px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-[560px] rounded-3xl border border-black/[0.07] bg-white px-6 py-14 text-center shadow-[0_24px_60px_-32px_rgba(0,0,0,0.28)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-3xl" aria-hidden>
            ✓
          </div>
          <h1 className="mt-5 text-[24px] font-extrabold text-[var(--color-text)]">Заявка принята</h1>
          <p className="mx-auto mt-3 max-w-[400px] text-[15px] leading-relaxed text-[var(--color-muted)]">
            Мастера уже получили её. Свободные откликнутся и свяжутся с вами, чтобы назвать
            стоимость. Обычно это занимает от 15 минут.
          </p>
          <p className="mt-6 text-[13px] text-black/40">Держите телефон под рукой.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[linear-gradient(180deg,#FFF7F4_0%,#FAFAF8_60%,#F4F5F2_100%)] px-4 py-7 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[560px]">
        <header className="mb-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.07] bg-white px-3.5 py-1.5 text-[12px] font-bold tracking-wide text-[var(--color-cta)] shadow-[0_10px_24px_-18px_rgba(0,0,0,0.45)]">
            <span aria-hidden>📍</span>
            {cityConfirmed ? `Мастера города ${city.trim()}` : "Мастера вашего города"}
          </span>

          <h1 className="mt-4 text-[28px] font-extrabold leading-[1.15] tracking-tight text-[var(--color-text)] sm:text-[34px]">
            Частные мастера рядом
            <br />
            <span className="text-[var(--color-cta)]">недорого и без посредников</span>
          </h1>

          <p className="mx-auto mt-3 max-w-[440px] text-[14px] leading-relaxed text-[var(--color-muted)]">
            Оставьте заявку — её увидят свободные мастера {cityLabel}. Несколько человек
            откликнутся и назовут свою цену — сравните и выберите своего.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { icon: "💰", label: "Недорого" },
              { icon: "👥", label: "Несколько цен" },
              { icon: "🛡", label: "Проверенные" },
            ].map(({ icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-black/[0.07] bg-white px-2 py-3 text-center shadow-[0_10px_24px_-20px_rgba(0,0,0,0.4)]"
              >
                <span aria-hidden>{icon}</span>
                <span className="text-[12px] font-semibold leading-tight text-[var(--color-text)]">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </header>

        <section className="rounded-3xl border border-black/[0.07] bg-white p-5 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.28)] sm:p-7">
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

              <div className="relative">
                <label className={labelClass} htmlFor="city">
                  Город
                </label>
                <div className="relative">
                  <input
                    id="city"
                    ref={cityInputRef}
                    className={inputClass}
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setSuggestOpen(true);
                      setCityTouched(true);
                    }}
                    onFocus={() => setSuggestOpen(true)}
                    onBlur={() => window.setTimeout(() => setSuggestOpen(false), 120)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setSuggestOpen(false);
                      const first = citySuggestions[0];
                      if (e.key === "Enter" && suggestOpen && first) {
                        e.preventDefault();
                        pickCity(first);
                      }
                    }}
                    placeholder="Начните вводить город"
                    autoComplete="off"
                  />
                  {cityConfirmed && (
                    <span
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-primary)]"
                      aria-hidden
                    >
                      ✓
                    </span>
                  )}
                </div>

                {suggestOpen && citySuggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1.5 max-h-[232px] w-full overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-[0_22px_46px_-20px_rgba(0,0,0,0.32)]">
                    {citySuggestions.map((suggestion) => (
                      <li key={suggestion}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickCity(suggestion)}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[15px] text-[var(--color-text)] transition hover:bg-black/[0.04]"
                        >
                          <span aria-hidden>📍</span>
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {cityTouched && !cityConfirmed && city.trim() !== "" && cities.length > 0 && (
                  <p className="mt-1.5 text-[12px] text-amber-600">
                    Выберите город из подсказок — так заявка точно дойдёт до мастеров.
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass} htmlFor="address">
                  Адрес объекта
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
                  Примерная площадь, м²
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
                            ? "rounded-full border border-[var(--color-cta)] bg-[var(--color-cta)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-on-cta)] transition"
                            : "rounded-full border border-black/10 bg-black/[0.02] px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-muted)] transition hover:border-[var(--color-cta)] hover:text-[var(--color-text)]"
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
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-cta)] px-5 py-4 text-[15px] font-bold text-[var(--color-on-cta)] shadow-[0_16px_34px_-14px_rgba(255,90,60,0.75)] transition hover:bg-[var(--color-cta-hover)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "sending" ? "Отправляем…" : "Узнать стоимость от нескольких мастеров"}
            </button>

            <p className="mt-3 text-center text-[11.5px] leading-relaxed text-black/40">
              Бесплатно и ни к чему не обязывает. Отправляя заявку, вы соглашаетесь на обработку
              персональных данных.
            </p>
          </form>
        </section>

        <footer className="mt-6 text-center text-[12px] text-black/40">
          Работаем с проверенными частными мастерами вашего города
        </footer>
      </div>
    </div>
  );
}
