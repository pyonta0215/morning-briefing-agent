/** 日付はすべて配信先のタイムゾーン（既定 Asia/Tokyo）で解釈する */
export function isoDateIn(date: Date, timeZone: string): string {
  return date.toLocaleDateString('sv-SE', { timeZone });
}

/** YYYY-MM-DD から n 日ずらした YYYY-MM-DD（暦の計算だけなのでタイムゾーンに依存しない） */
export function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 2026-10-11 → 2026年10月11日（日） */
export function formatIsoJP(iso: string): string {
  const w = WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${iso.slice(0, 4)}年${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日（${w}）`;
}
