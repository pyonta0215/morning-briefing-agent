import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { shiftIsoDate } from './date.js';
import { normalizeUrl } from './url.js';

/** 配信済みの記事1件。翌日以降の重複配信を防ぐために使う */
export interface DeliveredItem {
  url: string;
  title: string;
  topic: string;
  /** 配信日 YYYY-MM-DD */
  isoDate: string;
}

export const HISTORY_KEY = 'history/delivered.json';
export const HISTORY_RETENTION_DAYS = 14;

/**
 * 履歴に今日の配信分を足し、保持期間より古いものを落とす。
 * 同じURL（正規化後）は初めて配信した日を残す。
 */
export function mergeHistory(
  history: DeliveredItem[],
  today: DeliveredItem[],
  todayIso: string,
  retentionDays = HISTORY_RETENTION_DAYS
): DeliveredItem[] {
  const cutoff = shiftIsoDate(todayIso, -retentionDays);
  const merged = new Map<string, DeliveredItem>();
  for (const item of [...history, ...today]) {
    if (item.isoDate < cutoff) continue;
    const key = normalizeUrl(item.url);
    const existing = merged.get(key);
    if (!existing || item.isoDate < existing.isoDate) merged.set(key, item);
  }
  return [...merged.values()];
}

/** プロンプトに見せる直近の見出し（新しい順・上限あり。トークンを抑えるため） */
export function recentTitles(history: DeliveredItem[], todayIso: string, days = 7, max = 20): string[] {
  const cutoff = shiftIsoDate(todayIso, -days);
  return history
    .filter((d) => d.isoDate >= cutoff)
    .sort((a, b) => (a.isoDate < b.isoDate ? 1 : -1))
    .slice(0, max)
    .map((d) => d.title);
}

export interface HistoryStore {
  load(): Promise<DeliveredItem[]>;
  save(items: DeliveredItem[]): Promise<void>;
}

export function s3HistoryStore(s3: S3Client, bucket: string): HistoryStore {
  return {
    async load() {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: HISTORY_KEY }));
        const body = await res.Body?.transformToString();
        return body ? ((JSON.parse(body) as { entries?: DeliveredItem[] }).entries ?? []) : [];
      } catch (err) {
        // 初回はまだ無い。それ以外の失敗は履歴なしで続ける（重複が1日出るだけで、配信は止めない）
        if ((err as { name?: string }).name !== 'NoSuchKey') {
          console.warn(JSON.stringify({ type: 'HISTORY_LOAD_FAILED', error: String(err) }));
        }
        return [];
      }
    },
    async save(items) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: HISTORY_KEY,
          Body: JSON.stringify({ entries: items }),
          ContentType: 'application/json',
        })
      );
    },
  };
}

/** ローカル実行用。何も覚えない */
export const memoryHistoryStore = (initial: DeliveredItem[] = []): HistoryStore => {
  let items = initial;
  return {
    load: async () => items,
    save: async (next) => void (items = next),
  };
};
