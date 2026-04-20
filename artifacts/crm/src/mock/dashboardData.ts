// Mock data for CRM Dashboard

export const mockSummary = {
  revenue_today: 87500,
  revenue_today_prev: 72000,
  revenue_month: 1_840_000,
  revenue_month_prev: 1_560_000,
  leads_today: 23,
  leads_today_prev: 18,
  payments_today: 11,
  payments_today_prev: 8,
  masters_active: 34,
  masters_total: 41,
  masters_new_today: 3,
  masters_new_today_prev: 1,
  avito_balance: 750,
};

export const mockAlerts: { id: number; type: 'critical' | 'warning'; text: string; count: number; link: string }[] = [
  { id: 1, type: 'critical', text: 'Нет отклика мастера > 1ч', count: 2, link: '/orders?filter=no_response' },
  { id: 2, type: 'critical', text: 'Нет сметы > 24ч', count: 5, link: '/orders?filter=no_estimate' },
  { id: 3, type: 'warning', text: 'Нет оплаты > 48ч', count: 3, link: '/orders?filter=no_payment' },
  { id: 4, type: 'warning', text: 'Мастер молчит > 12ч', count: 4, link: '/master-chat' },
  { id: 5, type: 'critical', text: 'Баланс Авито < 1000', count: 1, link: '/settings' },
  { id: 6, type: 'warning', text: 'Заблокированных мастеров: 2', count: 2, link: '/masters?filter=fomo_blocked' },
  { id: 7, type: 'warning', text: 'Заказы без мастера > 2ч: 3', count: 3, link: '/orders?filter=no_master' },
];

export const mockForecast = {
  days_passed: 18,
  days_in_month: 31,
  revenue_so_far: 1_840_000,
  daily_average: 102_222,
  forecast: 3_168_889,
  goal: 3_000_000,
  status: 'ahead' as 'ahead' | 'on_track' | 'behind',
  progress_pct: 112,
};

export const mockRiskMonitor: {
  critical_count: number;
  warning_count: number;
  total_at_risk: number;
  orders: { id: number; master: string; city: string; risk_level: 'critical' | 'warning'; risk_reason: string; expected_commission: number }[];
} = {
  critical_count: 3,
  warning_count: 5,
  total_at_risk: 156_000,
  orders: [
    { id: 1041, master: 'Пётр Смирнов', city: 'Краснодар', risk_level: 'critical', risk_reason: 'Нет сметы 52ч', expected_commission: 18000 },
    { id: 1038, master: 'Алексей Попов', city: 'Ростов-на-Дону', risk_level: 'critical', risk_reason: 'Нет оплаты 74ч', expected_commission: 24000 },
    { id: 1035, master: 'Дмитрий Козлов', city: 'Краснодар', risk_level: 'warning', risk_reason: 'Нет движения 8 дней', expected_commission: 32000 },
    { id: 1029, master: 'Сергей Новиков', city: 'Сочи', risk_level: 'warning', risk_reason: 'Нет сметы 28ч', expected_commission: 5000 },
    { id: 1027, master: 'Иван Петров', city: 'Краснодар', risk_level: 'warning', risk_reason: 'Нет оплаты 51ч', expected_commission: 5000 },
  ],
};

function generateRevenueData(days: number) {
  const data = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const base = isWeekend ? 45000 : 95000;
    const variation = (Math.random() - 0.4) * 60000;
    data.push({
      date: date.toISOString().split('T')[0],
      amount: Math.max(0, Math.round(base + variation)),
    });
  }
  return data;
}

export const mockRevenueChart = {
  30: generateRevenueData(30),
  60: generateRevenueData(60),
  90: generateRevenueData(90),
};

export const mockFunnel = {
  contacts: 1240,
  leads: 892,
  assigned: 651,
  estimate_sent: 487,
  payment_received: 342,
  completed: 298,
  overall_conversion: 24.0,
  prev_conversion: 21.5,
};

type FeedType = 'payment' | 'new_lead' | 'assigned' | 'completed' | 'new_master';
export const mockLiveFeed: { id: number; type: FeedType; timestamp: Date; text: string; city: string; amount: number | null }[] = [
  { id: 1, type: 'payment', timestamp: new Date(Date.now() - 2 * 60000), text: 'Оплачена предоплата #1052 (12 000₽)', city: 'Краснодар', amount: 12000 },
  { id: 2, type: 'new_lead', timestamp: new Date(Date.now() - 5 * 60000), text: 'Новая заявка: укладка плитки, Краснодар', city: 'Краснодар', amount: null },
  { id: 3, type: 'assigned', timestamp: new Date(Date.now() - 12 * 60000), text: 'Мастер Пётр назначен на #1051', city: 'Ростов-на-Дону', amount: null },
  { id: 4, type: 'completed', timestamp: new Date(Date.now() - 18 * 60000), text: 'Заказ #1048 завершён (45 000₽)', city: 'Краснодар', amount: 45000 },
  { id: 5, type: 'new_master', timestamp: new Date(Date.now() - 25 * 60000), text: 'Зарегистрирован мастер Андрей, Сочи', city: 'Сочи', amount: null },
  { id: 6, type: 'payment', timestamp: new Date(Date.now() - 31 * 60000), text: 'Оплачена предоплата #1050 (8 000₽)', city: 'Ростов-на-Дону', amount: 8000 },
  { id: 7, type: 'new_lead', timestamp: new Date(Date.now() - 44 * 60000), text: 'Новая заявка: покраска стен, Сочи', city: 'Сочи', amount: null },
  { id: 8, type: 'assigned', timestamp: new Date(Date.now() - 55 * 60000), text: 'Мастер Дмитрий назначен на #1049', city: 'Краснодар', amount: null },
  { id: 9, type: 'payment', timestamp: new Date(Date.now() - 68 * 60000), text: 'Оплачена предоплата #1047 (15 000₽)', city: 'Краснодар', amount: 15000 },
  { id: 10, type: 'completed', timestamp: new Date(Date.now() - 82 * 60000), text: 'Заказ #1045 завершён (78 000₽)', city: 'Ростов-на-Дону', amount: 78000 },
  { id: 11, type: 'new_lead', timestamp: new Date(Date.now() - 95 * 60000), text: 'Новая заявка: ламинат, Краснодар', city: 'Краснодар', amount: null },
  { id: 12, type: 'new_master', timestamp: new Date(Date.now() - 110 * 60000), text: 'Зарегистрирован мастер Михаил, Краснодар', city: 'Краснодар', amount: null },
  { id: 13, type: 'assigned', timestamp: new Date(Date.now() - 125 * 60000), text: 'Мастер Алексей назначен на #1046', city: 'Краснодар', amount: null },
  { id: 14, type: 'payment', timestamp: new Date(Date.now() - 142 * 60000), text: 'Оплачена предоплата #1044 (5 000₽)', city: 'Сочи', amount: 5000 },
  { id: 15, type: 'completed', timestamp: new Date(Date.now() - 160 * 60000), text: 'Заказ #1042 завершён (120 000₽)', city: 'Краснодар', amount: 120000 },
  { id: 16, type: 'new_lead', timestamp: new Date(Date.now() - 178 * 60000), text: 'Новая заявка: обои, Ростов-на-Дону', city: 'Ростов-на-Дону', amount: null },
  { id: 17, type: 'payment', timestamp: new Date(Date.now() - 195 * 60000), text: 'Оплачена предоплата #1043 (22 000₽)', city: 'Краснодар', amount: 22000 },
  { id: 18, type: 'assigned', timestamp: new Date(Date.now() - 215 * 60000), text: 'Мастер Сергей назначен на #1044', city: 'Краснодар', amount: null },
];

export const mockSpeedMetrics = {
  assign_min: { current: 24, prev: 31, norm: 30 },
  estimate_h: { current: 7.2, prev: 5.8, norm: 6 },
  payment_h: { current: 9.5, prev: 11.2, norm: 12 },
  completion_d: { current: 4.1, prev: 4.8, norm: 3 },
  lifecycle_d: { current: 6.2, prev: 7.1, norm: 7 },
};

export const mockCities = [
  { city: 'Краснодар', leads: 512, payments: 189, revenue: 1_240_000, masters_total: 18, masters_active: 14, conversion: 36.9 },
  { city: 'Ростов-на-Дону', leads: 341, payments: 98, revenue: 680_000, masters_total: 12, masters_active: 10, conversion: 28.7 },
  { city: 'Сочи', leads: 187, payments: 41, revenue: 312_000, masters_total: 7, masters_active: 6, conversion: 21.9 },
  { city: 'Новороссийск', leads: 124, payments: 14, revenue: 98_000, masters_total: 4, masters_active: 4, conversion: 11.3 },
];

export const mockRoiSources = [
  { source: 'Авито', leads: 612, orders: 234, revenue: 1_580_000, spend: 120_000, conversion: 38.2, roi: 13.2 },
  { source: 'Органика', leads: 287, orders: 124, revenue: 840_000, spend: 0, conversion: 43.2, roi: null },
  { source: 'Рекомендации', leads: 198, orders: 88, revenue: 610_000, spend: 0, conversion: 44.4, roi: null },
  { source: 'ВКонтакте', leads: 89, orders: 18, revenue: 120_000, spend: 45_000, conversion: 20.2, roi: 2.7 },
  { source: 'Яндекс.Директ', leads: 54, orders: 8, revenue: 52_000, spend: 38_000, conversion: 14.8, roi: 1.4 },
];

export const mockTopMasters = [
  { id: 1, name: 'Александр Волков', city: 'Краснодар', orders_completed: 28, conversion: 87, rating: 4.9, revenue_brought: 184000 },
  { id: 2, name: 'Пётр Смирнов', city: 'Краснодар', orders_completed: 24, conversion: 82, rating: 4.8, revenue_brought: 156000 },
  { id: 3, name: 'Дмитрий Козлов', city: 'Ростов-на-Дону', orders_completed: 21, conversion: 78, rating: 4.7, revenue_brought: 138000 },
  { id: 4, name: 'Алексей Попов', city: 'Ростов-на-Дону', orders_completed: 18, conversion: 75, rating: 4.6, revenue_brought: 112000 },
  { id: 5, name: 'Сергей Новиков', city: 'Сочи', orders_completed: 15, conversion: 71, rating: 4.5, revenue_brought: 95000 },
];

export const mockRecentOrders = [
  { id: 1052, created_at: new Date(Date.now() - 2 * 60000), city: 'Краснодар', client: 'Анна М.', master: 'А. Волков', service: 'Укладка плитки', amount: 85000, status: 'in_progress' },
  { id: 1051, created_at: new Date(Date.now() - 8 * 60000), city: 'Ростов-на-Дону', client: 'Игорь К.', master: 'П. Смирнов', service: 'Покраска стен', amount: 42000, status: 'awaiting_payment' },
  { id: 1050, created_at: new Date(Date.now() - 15 * 60000), city: 'Ростов-на-Дону', client: 'Мария С.', master: 'Д. Козлов', service: 'Обои', amount: 28000, status: 'completed' },
  { id: 1049, created_at: new Date(Date.now() - 28 * 60000), city: 'Краснодар', client: 'Олег Т.', master: null, service: 'Ламинат', amount: null, status: 'searching' },
  { id: 1048, created_at: new Date(Date.now() - 45 * 60000), city: 'Сочи', client: 'Елена Р.', master: 'А. Попов', service: 'Ванная комплекс', amount: 155000, status: 'completed' },
  { id: 1047, created_at: new Date(Date.now() - 62 * 60000), city: 'Краснодар', client: 'Виктор Н.', master: 'С. Новиков', service: 'Электрика', amount: 35000, status: 'awaiting_estimate' },
  { id: 1046, created_at: new Date(Date.now() - 88 * 60000), city: 'Краснодар', client: 'Светлана В.', master: 'А. Волков', service: 'Покраска потолка', amount: 18000, status: 'on_site' },
  { id: 1045, created_at: new Date(Date.now() - 120 * 60000), city: 'Новороссийск', client: 'Андрей Б.', master: 'П. Смирнов', service: 'Комплексный ремонт', amount: 320000, status: 'in_progress' },
  { id: 1044, created_at: new Date(Date.now() - 185 * 60000), city: 'Сочи', client: 'Наталья Г.', master: 'Д. Козлов', service: 'Стяжка пола', amount: 67000, status: 'awaiting_payment' },
  { id: 1043, created_at: new Date(Date.now() - 240 * 60000), city: 'Краснодар', client: 'Роман Ш.', master: null, service: 'Штукатурка', amount: null, status: 'problem' },
];
