import type { Topic } from './topics.js';
import type { CandidatesByTopic } from './summarize.js';
import { dedupeByUrl, normalizeUrl } from './url.js';

export interface SelectedItem {
  url: string;
  title: string;
  summary: string;
  score: number;
  topic: string;
}

export interface SelectOptions {
  /** これ以上のスコアは全件載せる */
  threshold?: number;
  /**
   * 閾値を超える記事が無いトピックで、最高スコアの1件を救う下限。
   * 救済は「集約がトピックを丸ごと落とす」崩れへの保険で、「無関係でも1件は載せる」ではない。
   * 対象の広い一次情報（全省庁のパブコメなど）を足すと、この下限が無ければ毎日ノイズが1件載る。
   */
  rescueMin?: number;
  /** topic.maxItems が無いときの1トピックあたりの上限 */
  defaultMaxItems?: number;
}

export interface SelectResult {
  byTopic: Record<string, SelectedItem[]>;
  stats: { rescued: number; droppedLowScore: number; duplicates: number; alreadyDelivered: number };
}

/**
 * LLM が付けたスコアから、メールに載せる記事を機械的に決める。
 * 同じ入力からは必ず同じ出力になるので、テストで固定できる。
 */
export function selectItems(
  topics: Topic[],
  candidates: CandidatesByTopic,
  deliveredUrls: ReadonlySet<string>,
  opts: SelectOptions = {}
): SelectResult {
  const { threshold = 4, rescueMin = 3, defaultMaxItems = 8 } = opts;
  const stats = { rescued: 0, droppedLowScore: 0, duplicates: 0, alreadyDelivered: 0 };
  const perTopic: SelectedItem[] = [];

  for (const topic of topics) {
    const raw = (candidates[topic.id] ?? []).map((c) => ({ ...c, topic: topic.id }));
    const fresh = raw.filter((c) => !deliveredUrls.has(normalizeUrl(c.url)));
    stats.alreadyDelivered += raw.length - fresh.length;
    const unique = dedupeByUrl(fresh, (a, b) => a.score > b.score);
    stats.duplicates += fresh.length - unique.length;

    let kept = unique.filter((c) => c.score >= threshold);
    if (kept.length === 0 && unique.length > 0) {
      const best = unique.reduce((a, b) => (b.score > a.score ? b : a));
      if (best.score >= rescueMin) {
        kept = [best];
        stats.rescued++;
      } else {
        stats.droppedLowScore++;
      }
    }
    kept.sort((a, b) => b.score - a.score);
    perTopic.push(...kept.slice(0, topic.maxItems ?? defaultMaxItems));
  }

  // トピックを跨いだ重複は、スコアの高い方（同点なら topics.yaml で先のトピック）を残す
  const unique = dedupeByUrl(perTopic, (a, b) => a.score > b.score);
  stats.duplicates += perTopic.length - unique.length;
  const byTopic: Record<string, SelectedItem[]> = Object.fromEntries(topics.map((t) => [t.id, []]));
  for (const item of unique) byTopic[item.topic].push(item);
  for (const items of Object.values(byTopic)) items.sort((a, b) => b.score - a.score);
  return { byTopic, stats };
}
