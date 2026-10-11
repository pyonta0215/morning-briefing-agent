import type { Topic } from '../topics.js';
import { formatEntries, htmlToText, isFeed, parseFeed } from './feed.js';

export interface SourceSpec {
  topicId: string;
  label: string;
  url: string;
}

export interface CollectedSource extends SourceSpec {
  /** LLM に渡すテキスト。取得に失敗したときは理由を入れる（その旨が LLM にも伝わる） */
  content: string;
  ok: boolean;
}

/** トピックごとの収集先。urls に加え、keywords があれば Google News の検索結果 RSS を足す */
export function sourcesFor(topics: Topic[], yesterdayIso: string): SourceSpec[] {
  return topics.flatMap((topic) => {
    const fixed = topic.urls.map((url) => ({ topicId: topic.id, label: topic.label, url }));
    if (topic.keywords.length === 0) return fixed;
    const q = encodeURIComponent(`${topic.keywords.join(' OR ')} after:${yesterdayIso}`);
    return [
      ...fixed,
      {
        topicId: topic.id,
        label: `${topic.label}（ニュース検索）`,
        url: `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`,
      },
    ];
  });
}

export interface FetchSourceOptions {
  since: Date;
  excludeUrls: ReadonlySet<string>;
  maxLength?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** 1つの収集先を取りに行く。失敗しても例外にせず、他の収集先と朝のメールは止めない */
export async function fetchSource(spec: SourceSpec, opts: FetchSourceOptions): Promise<CollectedSource> {
  const { maxLength = 2000, timeoutMs = 10_000, fetchImpl = fetch } = opts;
  try {
    const res = await fetchImpl(spec.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MorningBriefingAgent/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    const content = isFeed(body)
      ? formatEntries(parseFeed(body, { since: opts.since, excludeUrls: opts.excludeUrls }))
      : htmlToText(body);
    return { ...spec, content: content.slice(0, maxLength), ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(JSON.stringify({ type: 'SOURCE_FETCH_FAILED', url: spec.url, reason }));
    return { ...spec, content: `（取得失敗: ${reason}）`, ok: false };
  }
}
