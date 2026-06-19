/**
 * Программная floor-plan SVG — строится исходя из roomType + area, не AI.
 * Магазинный стилизованный «вид сверху», не точная архитектурная схема.
 *
 * Для каждого room-type зашит layout рассtanovки мебели — кровать, шкаф,
 * кухонный гарнитур и т.п. Размеры приблизительные, но визуально
 * читаемо и узнаваемо.
 *
 * Зачем: в референсе ChatGPT был isometric floor plan; AI часто рисует
 * gibberish. SVG-программный — всегда читаемо, всегда консистентно,
 * indexable как векторная графика.
 */

interface Props {
  roomType: string;
  area: number | null;
}

export function FloorPlanSVG({ roomType, area }: Props) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 320 240"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full h-auto"
        aria-label="План помещения"
      >
        {/* Background */}
        <rect x="0" y="0" width="320" height="240" fill="#FAFAF7" />

        {/* Room walls (outer rectangle) */}
        <rect
          x="20"
          y="20"
          width="280"
          height="200"
          fill="#FFFFFF"
          stroke="#0F172A"
          strokeWidth="3"
        />

        {/* Door opening (gap in left wall) */}
        <line x1="20" y1="40" x2="20" y2="80" stroke="#FAFAF7" strokeWidth="3" />
        <path d="M 20 80 A 40 40 0 0 1 60 40" fill="none" stroke="#0F172A" strokeWidth="0.8" strokeDasharray="2 2" />

        {/* Room-specific furniture */}
        {roomType === "bedroom" ? <BedroomFurniture /> : null}
        {roomType === "bathroom" ? <BathroomFurniture /> : null}
        {roomType === "kitchen" ? <KitchenFurniture /> : null}
        {roomType === "living_room" ? <LivingRoomFurniture /> : null}
        {roomType === "hallway" ? <HallwayFurniture /> : null}
        {roomType === "apartment" ? <ApartmentFurniture /> : null}

        {/* Window (top wall gap with frame indicator) */}
        <rect x="200" y="17" width="60" height="6" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.5" />
        <line x1="230" y1="17" x2="230" y2="23" stroke="#0F172A" strokeWidth="1" />
      </svg>

      {area ? (
        <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
          {area} м²
        </p>
      ) : null}
    </div>
  );
}

function BedroomFurniture() {
  return (
    <g>
      {/* Кровать */}
      <rect x="50" y="80" width="80" height="120" fill="#E8DFD0" stroke="#0F172A" strokeWidth="1" />
      <rect x="55" y="85" width="70" height="20" fill="#FFFFFF" stroke="#0F172A" strokeWidth="0.5" />
      <text x="90" y="148" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">кровать</text>
      {/* Прикроватные тумбы */}
      <rect x="50" y="60" width="35" height="18" fill="#D8D3C4" stroke="#0F172A" strokeWidth="0.8" />
      <rect x="95" y="60" width="35" height="18" fill="#D8D3C4" stroke="#0F172A" strokeWidth="0.8" />
      {/* Шкаф у правой стены */}
      <rect x="240" y="40" width="55" height="120" fill="#A07A55" stroke="#0F172A" strokeWidth="1" />
      <line x1="267" y1="40" x2="267" y2="160" stroke="#0F172A" strokeWidth="0.5" />
      <text x="267" y="105" textAnchor="middle" fontSize="9" fill="#FFFFFF" fontFamily="sans-serif">шкаф</text>
      {/* Рабочий стол у окна */}
      <rect x="200" y="190" width="80" height="20" fill="#A07A55" stroke="#0F172A" strokeWidth="0.8" />
      <text x="240" y="204" textAnchor="middle" fontSize="8" fill="#FFFFFF" fontFamily="sans-serif">стол</text>
    </g>
  );
}

function BathroomFurniture() {
  return (
    <g>
      {/* Ванна */}
      <rect x="40" y="50" width="120" height="60" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1" rx="6" />
      <text x="100" y="84" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">ванна</text>
      {/* Раковина с тумбой */}
      <rect x="180" y="50" width="120" height="30" fill="#D8D3C4" stroke="#0F172A" strokeWidth="1" />
      <ellipse cx="240" cy="65" rx="18" ry="10" fill="#FFFFFF" stroke="#0F172A" strokeWidth="0.8" />
      <text x="240" y="92" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">раковина</text>
      {/* Унитаз */}
      <rect x="50" y="160" width="40" height="50" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1" rx="3" />
      <ellipse cx="70" cy="180" rx="14" ry="14" fill="#FFFFFF" stroke="#0F172A" strokeWidth="0.5" />
      <text x="70" y="222" textAnchor="middle" fontSize="8" fill="#475569" fontFamily="sans-serif">WC</text>
      {/* Душевая зона */}
      <rect x="190" y="120" width="100" height="80" fill="#F1EEE7" stroke="#0F172A" strokeWidth="1" strokeDasharray="3 3" />
      <text x="240" y="164" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">душ</text>
    </g>
  );
}

function KitchenFurniture() {
  return (
    <g>
      {/* Гарнитур L-образный вдоль двух стен */}
      <rect x="40" y="40" width="240" height="35" fill="#A07A55" stroke="#0F172A" strokeWidth="1" />
      <text x="160" y="62" textAnchor="middle" fontSize="9" fill="#FFFFFF" fontFamily="sans-serif">кухонный гарнитур</text>
      {/* Боковая часть */}
      <rect x="245" y="80" width="35" height="100" fill="#A07A55" stroke="#0F172A" strokeWidth="1" />
      {/* Холодильник */}
      <rect x="40" y="80" width="40" height="40" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1" />
      <text x="60" y="103" textAnchor="middle" fontSize="8" fill="#475569" fontFamily="sans-serif">холод</text>
      {/* Обеденный стол по центру */}
      <ellipse cx="160" cy="145" rx="40" ry="25" fill="#D8D3C4" stroke="#0F172A" strokeWidth="1" />
      <text x="160" y="148" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">стол</text>
      {/* Стулья */}
      <circle cx="120" cy="145" r="6" fill="#0F172A" />
      <circle cx="200" cy="145" r="6" fill="#0F172A" />
    </g>
  );
}

function LivingRoomFurniture() {
  return (
    <g>
      {/* Диван */}
      <rect x="40" y="100" width="100" height="40" fill="#0E7C5E" opacity="0.85" stroke="#0F172A" strokeWidth="1" rx="4" />
      <rect x="40" y="95" width="20" height="50" fill="#0E7C5E" opacity="0.85" stroke="#0F172A" strokeWidth="0.8" />
      <rect x="120" y="95" width="20" height="50" fill="#0E7C5E" opacity="0.85" stroke="#0F172A" strokeWidth="0.8" />
      <text x="90" y="125" textAnchor="middle" fontSize="9" fill="#FFFFFF" fontFamily="sans-serif">диван</text>
      {/* Журнальный столик */}
      <rect x="60" y="160" width="60" height="30" fill="#A07A55" stroke="#0F172A" strokeWidth="0.8" rx="3" />
      <text x="90" y="178" textAnchor="middle" fontSize="8" fill="#FFFFFF" fontFamily="sans-serif">столик</text>
      {/* TV-зона */}
      <rect x="190" y="40" width="100" height="14" fill="#0F172A" stroke="#0F172A" strokeWidth="0.5" />
      <text x="240" y="50" textAnchor="middle" fontSize="8" fill="#FFFFFF" fontFamily="sans-serif">ТВ</text>
      <rect x="180" y="60" width="120" height="40" fill="#A07A55" stroke="#0F172A" strokeWidth="0.8" />
      {/* Кресло */}
      <rect x="220" y="140" width="40" height="40" fill="#D8D3C4" stroke="#0F172A" strokeWidth="0.8" rx="4" />
      <text x="240" y="163" textAnchor="middle" fontSize="8" fill="#475569" fontFamily="sans-serif">кресло</text>
    </g>
  );
}

function HallwayFurniture() {
  return (
    <g>
      {/* Шкаф во всю стену */}
      <rect x="40" y="40" width="40" height="160" fill="#A07A55" stroke="#0F172A" strokeWidth="1" />
      <line x1="60" y1="40" x2="60" y2="200" stroke="#0F172A" strokeWidth="0.5" />
      <text x="60" y="125" textAnchor="middle" fontSize="9" fill="#FFFFFF" fontFamily="sans-serif" transform="rotate(-90 60 125)">шкаф-купе</text>
      {/* Зеркало */}
      <rect x="240" y="60" width="50" height="120" fill="#F1EEE7" stroke="#0F172A" strokeWidth="1" />
      <text x="265" y="125" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif" transform="rotate(-90 265 125)">зеркало</text>
      {/* Тумба */}
      <rect x="120" y="170" width="80" height="30" fill="#D8D3C4" stroke="#0F172A" strokeWidth="0.8" />
      <text x="160" y="190" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">тумба</text>
    </g>
  );
}

function ApartmentFurniture() {
  return (
    <g>
      {/* Гостиная зона */}
      <rect x="40" y="40" width="120" height="80" fill="none" stroke="#475569" strokeWidth="0.8" strokeDasharray="4 3" />
      <rect x="50" y="70" width="60" height="25" fill="#0E7C5E" opacity="0.85" stroke="#0F172A" strokeWidth="0.8" rx="3" />
      <text x="100" y="55" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">гостиная</text>
      {/* Спальня */}
      <rect x="180" y="40" width="120" height="80" fill="none" stroke="#475569" strokeWidth="0.8" strokeDasharray="4 3" />
      <rect x="200" y="65" width="60" height="40" fill="#E8DFD0" stroke="#0F172A" strokeWidth="0.8" />
      <text x="240" y="55" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">спальня</text>
      {/* Кухня */}
      <rect x="40" y="140" width="120" height="80" fill="none" stroke="#475569" strokeWidth="0.8" strokeDasharray="4 3" />
      <rect x="50" y="150" width="100" height="20" fill="#A07A55" stroke="#0F172A" strokeWidth="0.8" />
      <text x="100" y="195" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">кухня</text>
      {/* Ванная */}
      <rect x="180" y="140" width="120" height="80" fill="none" stroke="#475569" strokeWidth="0.8" strokeDasharray="4 3" />
      <rect x="195" y="155" width="50" height="25" fill="#FFFFFF" stroke="#0F172A" strokeWidth="0.8" rx="2" />
      <text x="240" y="195" textAnchor="middle" fontSize="9" fill="#475569" fontFamily="sans-serif">ванная</text>
    </g>
  );
}
