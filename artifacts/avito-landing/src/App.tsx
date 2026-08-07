import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MapPin,
  Ruler,
  ShieldCheck,
  Star,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { master1, master2, master3, master4, master5 } from "./assets/masters/avatars";

const MASTER_AVATARS = [master1, master2, master3, master4, master5];

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

const MAX_PHOTOS = 5;
const MAX_PHOTO_EDGE = 1280; // клиентское сжатие до 1280px по большей стороне
const PHOTO_QUALITY = 0.72;

type Status = "idle" | "sending" | "done";

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeForSearch(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

// Клиентское сжатие фото: чтобы 5 фото с телефона (5×4МБ=20МБ) превратились
// в разумные 5×150КБ, и запрос не падал на лимитах body-parser'а или Railway.
function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("img"));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function App() {
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosBusy, setPhotosBusy] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const cityInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/landing/cities`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad_status"))))
      .then((data: { cities?: string[] }) => {
        if (cancelled) return;
        const list = Array.isArray(data.cities) ? data.cities : [];
        setCities(list);
        if (list.length === 1) setCity(list[0]);
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Метки рекламной кампании — на случай если захотите добавить utm позже.
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

  const cityConfirmed = useMemo(
    () => cities.some((c) => normalizeForSearch(c) === normalizeForSearch(city)),
    [cities, city]
  );

  const citySuggestions = useMemo(() => {
    if (cities.length === 0) return [];
    const query = normalizeForSearch(city);
    if (query === "") return cities.slice(0, 6);
    if (cityConfirmed) return [];
    const starts = cities.filter((c) => normalizeForSearch(c).startsWith(query));
    const contains = cities.filter(
      (c) => !normalizeForSearch(c).startsWith(query) && normalizeForSearch(c).includes(query)
    );
    return [...starts, ...contains].slice(0, 6);
  }, [cities, city, cityConfirmed]);

  const toggleService = (service: string) => {
    setServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
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
    if (!cityConfirmed) return "Выберите город из списка";
    if (address.trim().length < 3) return "Укажите адрес объекта (улица и дом)";
    if (description.trim().length < 5) return "Коротко опишите, что нужно сделать";
    const areaNum = Number(area);
    if (!area || Number.isNaN(areaNum) || areaNum <= 0) return "Укажите примерную площадь в м²";
    if (services.length === 0) return "Выберите хотя бы один вид работ";
    return null;
  };

  const handleAddPhotos = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const available = MAX_PHOTOS - photos.length;
    if (available <= 0) return;
    const files = Array.from(fileList).slice(0, available);
    setPhotosBusy(true);
    try {
      const results: string[] = [];
      for (const f of files) {
        if (!f.type.startsWith("image/")) continue;
        try {
          const dataUrl = await compressPhoto(f);
          results.push(dataUrl);
        } catch {
          /* skip bad file */
        }
      }
      setPhotos((prev) => [...prev, ...results].slice(0, MAX_PHOTOS));
    } finally {
      setPhotosBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
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
          area: Number(area),
          services,
          photos,
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
  const requiredMark = <span className="ml-0.5 text-red-500">*</span>;

  const cityLabel = cityConfirmed ? city.trim() : "вашего города";

  const onlineMastersCount = useMemo(() => {
    const base = cityConfirmed
      ? 5 + (city.trim().length * 7) % 12
      : 8;
    return base;
  }, [city, cityConfirmed]);

  const mastersPlural = (n: number) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "мастер";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "мастера";
    return "мастеров";
  };

  return (
    <div className="surface-page min-h-screen w-full px-4 py-7 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[560px]">
        <header className="mb-6 text-center">
          <span className="chip-soft inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-bold tracking-wide text-emerald-700">
            <MapPin className="h-3.5 w-3.5" />
            {cityConfirmed ? `Мастера города ${city.trim()}` : "Мастера вашего города"}
          </span>

          <h1 className="mt-4 text-[28px] font-extrabold leading-[1.15] tracking-tight text-slate-900 sm:text-[34px]">
            Частные мастера рядом
            <br />
            <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
              недорого и без посредников
            </span>
          </h1>

          <p className="mx-auto mt-3 max-w-[440px] text-[14px] leading-relaxed text-slate-600">
            Оставьте заявку — её увидят свободные мастера {cityLabel}. Несколько человек
            откликнутся и назовут свою цену — сравните и выберите своего.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { icon: Wallet, label: "Недорого" },
              { icon: Users, label: "Несколько цен" },
              { icon: ShieldCheck, label: "Проверенные" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="chip-soft flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center"
              >
                <Icon className="h-4 w-4 text-emerald-600" />
                <span className="text-[12px] font-semibold leading-tight text-slate-700">{label}</span>
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
                    Как к вам обращаться{requiredMark}
                  </label>
                  <input
                    id="name"
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Имя"
                    autoComplete="name"
                    required
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="phone">
                    Телефон для связи{requiredMark}
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
                    required
                  />
                </div>

                <div className="relative">
                  <label className={labelClass} htmlFor="city">
                    Город{requiredMark}
                  </label>
                  <div className="relative">
                    <input
                      id="city"
                      ref={cityInputRef}
                      className={`${inputClass} ${cityConfirmed ? "pr-10" : ""}`}
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
                        if (e.key === "Enter" && suggestOpen && citySuggestions.length > 0) {
                          e.preventDefault();
                          pickCity(citySuggestions[0]);
                        }
                      }}
                      placeholder="Начните вводить и выберите из списка"
                      autoComplete="off"
                      required
                    />
                    {cityConfirmed && (
                      <Check className="pointer-events-none absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-emerald-600" />
                    )}
                  </div>

                  {suggestOpen && citySuggestions.length > 0 && (
                    <ul className="suggest-panel absolute z-20 mt-1.5 max-h-[232px] w-full overflow-y-auto rounded-xl py-1">
                      {citySuggestions.map((suggestion) => (
                        <li key={suggestion}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickCity(suggestion)}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14.5px] text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800"
                          >
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            {suggestion}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {cityTouched && !cityConfirmed && (
                    <p className="mt-1.5 text-[12px] text-amber-600">
                      Выберите город из подсказок — так заявка точно дойдёт до мастеров.
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClass} htmlFor="address">
                    Адрес объекта{requiredMark}
                  </label>
                  <input
                    id="address"
                    className={inputClass}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Улица, дом, квартира"
                    autoComplete="street-address"
                    required
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="description">
                    Что нужно сделать{requiredMark}
                  </label>
                  <textarea
                    id="description"
                    className={`${inputClass} min-h-[92px] resize-y`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Например: поклеить обои в двух комнатах, стены подготовлены"
                    required
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="area">
                    <span className="inline-flex items-center gap-1.5">
                      <Ruler className="h-3.5 w-3.5 text-emerald-600" />
                      Примерная площадь, м²{requiredMark}
                    </span>
                  </label>
                  <input
                    id="area"
                    className={inputClass}
                    value={area}
                    onChange={(e) => setArea(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="Например 35"
                    inputMode="decimal"
                    required
                  />
                </div>

                <div>
                  <span className={labelClass}>
                    Вид работ{requiredMark} <span className="font-normal text-slate-400">— выберите хотя бы один</span>
                  </span>
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

                <div>
                  <span className={labelClass}>Фото объекта <span className="font-normal text-slate-400">— необязательно, до {MAX_PHOTOS} шт.</span></span>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleAddPhotos(e.target.files)}
                  />
                  {photos.length > 0 && (
                    <div className="mb-2 grid grid-cols-5 gap-2">
                      {photos.map((src, i) => (
                        <div key={i} className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-slate-200">
                          <img src={src} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                            aria-label="Удалить фото"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={photosBusy || photos.length >= MAX_PHOTOS}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-[14px] font-medium text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {photosBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Обрабатываем…
                      </>
                    ) : photos.length >= MAX_PHOTOS ? (
                      <>
                        <Camera className="h-4 w-4" />
                        Максимум {MAX_PHOTOS} фото добавлено
                      </>
                    ) : photos.length > 0 ? (
                      <>
                        <ImagePlus className="h-4 w-4" />
                        Добавить ещё фото ({photos.length}/{MAX_PHOTOS})
                      </>
                    ) : (
                      <>
                        <ImagePlus className="h-4 w-4" />
                        Прикрепить фото объекта (по желанию)
                      </>
                    )}
                  </button>
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

              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50/70 px-3.5 py-3 ring-1 ring-emerald-100">
                <div className="relative flex shrink-0 -space-x-2.5">
                  {MASTER_AVATARS.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt=""
                      width={36}
                      height={36}
                      loading="lazy"
                      decoding="async"
                      className="relative h-9 w-9 rounded-full object-cover ring-2 ring-white"
                      style={{ zIndex: MASTER_AVATARS.length - i }}
                    />
                  ))}
                  <span
                    className="absolute -right-1 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-white"
                    style={{ zIndex: MASTER_AVATARS.length + 1 }}
                    aria-hidden
                  >
                    <span className="absolute inline-flex h-4 w-4 animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                  </span>
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-[13px] font-semibold text-emerald-900">
                    {cityConfirmed
                      ? `${onlineMastersCount} ${mastersPlural(onlineMastersCount)} сейчас онлайн в г. ${city.trim()}`
                      : "Мастера рядом сейчас онлайн"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-emerald-700/80">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    Проверенные профили · отклик в течение 15 минут
                  </p>
                </div>
              </div>

              <p className="mt-3 text-center text-[11.5px] leading-relaxed text-slate-400">
                Бесплатно и ни к чему не обязывает. Отправляя заявку, вы соглашаетесь на
                обработку персональных данных.
              </p>
            </form>
          </section>
        )}

        <footer className="mt-6 text-center text-[12px] text-slate-400">
          Работаем с проверенными частными мастерами вашего города
        </footer>
      </div>
    </div>
  );
}
