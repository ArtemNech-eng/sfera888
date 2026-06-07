export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}М₽`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}К₽`;
  }
  return `${value.toLocaleString('ru-RU')}₽`;
}

export function formatCurrencyFull(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "— ₽";
  return `${value.toLocaleString('ru-RU')} ₽`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString('ru-RU');
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return "—%";
  return `${value.toFixed(decimals)}%`;
}

export function formatChange(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diff < 60) return `${diff}с назад`;
  if (diff < 3600) return `${Math.floor(diff / 60)}м назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч назад`;
  return `${Math.floor(diff / 86400)}д назад`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (m === 0) return `${h} ч`;
  return `${h}ч ${m}м`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

export function formatFullDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
