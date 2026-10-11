import { search, trending } from 'research-hub-mcp/lib';
import type { Item } from 'research-hub-mcp/schema';
import type { Topic } from '../topics.js';
import { normalizeUrl } from '../url.js';
import { formatEntries } from './feed.js';

// research-hub-mcp の service 層を直接呼ぶ。Lambda のバッチ処理では MCP の往復は純粋な損なので介さない。
// 責務は「取得と正規化」まで。選別とスコア付けは集約（LLM）に任せる。

const DEFAULT_LIMIT = 3;
/** 1トピックが集約へ持ち込める上限（プロンプト肥大の安全弁） */
const MAX_ITEMS_PER_TOPIC = 12;
/** arXiv は1回6〜14秒かかることがあるので長め。ただし朝のメールは止めない */
const CALL_TIMEOUT_MS = 20_000;

export interface ResearchResult {
  items: Item[];
  errors: string[];
}

type Call = () => Promise<{ items: Item[]; errors: string[] }>;

export async function collectResearch(
  topic: Topic,
  excludeUrls: ReadonlySet<string>,
  api: { search: typeof search; trending: typeof trending } = { search, trending }
): Promise<ResearchResult> {
  const spec = topic.research;
  if (!spec) return { items: [], errors: [] };

  const calls: Array<{ label: string; run: Call }> = [];
  if (spec.search) {
    const { sources, since, limit, sort } = spec.search;
    const queries = (spec.search.queries ?? topic.keywords).filter((q) => q.trim());
    for (const query of queries) {
      calls.push({
        label: `search(${query})`,
        run: () => api.search({ query, sources, since, limit: limit ?? DEFAULT_LIMIT, sort: sort ?? 'score' }),
      });
    }
  }
  for (const t of spec.trending ?? []) {
    calls.push({
      label: `trending(${t.source})`,
      run: () =>
        api.trending({ source: t.source, category: t.category, period: t.period ?? 'day', limit: t.limit ?? DEFAULT_LIMIT }),
    });
  }

  const settled = await Promise.allSettled(calls.map((c) => withTimeout(c.run(), c.label)));
  const errors: string[] = [];
  const items: Item[] = [];
  const seen = new Set(excludeUrls);
  settled.forEach((s, i) => {
    if (s.status === 'rejected') {
      errors.push(`${calls[i].label}: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
      return;
    }
    // research-hub は一部ソースの失敗を errors に載せて成功扱いで返す。握りつぶさない
    for (const e of s.value.errors) errors.push(`${calls[i].label}: ${e}`);
    for (const item of s.value.items) {
      const key = normalizeUrl(item.url ?? item.id);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  });
  items.sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.published_at ?? '').localeCompare(a.published_at ?? '')
  );
  return { items: items.slice(0, MAX_ITEMS_PER_TOPIC), errors };
}

export function formatResearch(items: Item[]): string {
  return formatEntries(
    items.map((it) => ({
      url: it.url ?? it.discussion_url ?? '',
      title: it.title,
      pubDate: it.published_at,
      description: [it.source, it.score !== undefined ? `スコア${it.score}` : '', it.snippet ?? '']
        .filter(Boolean)
        .join(' / '),
    }))
  );
}

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: ${CALL_TIMEOUT_MS}ms でタイムアウト`)), CALL_TIMEOUT_MS);
    timer.unref();
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
