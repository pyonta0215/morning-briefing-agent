import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

/** research-hub-mcp（Hacker News / arXiv / GitHub / RSS）から候補を足す設定 */
export interface ResearchSpec {
  search?: {
    /** 省略時は topic.keywords を1語ずつ使う（HN検索は語をANDで扱うため、まとめて投げると0件になりやすい） */
    queries?: string[];
    /** 省略時は全ソース。arXiv は遅いので明示して絞るのがおすすめ */
    sources?: string[];
    /** "2d" "24h" など */
    since?: string;
    /** 1クエリ・1ソースあたりの件数 */
    limit?: number;
    /** 既定は score。date にすると HN の投稿直後の低スコア記事ばかりになる */
    sort?: 'relevance' | 'date' | 'score';
  };
  trending?: Array<{
    source: string;
    category?: string;
    period?: 'day' | 'week';
    limit?: number;
  }>;
}

export interface Topic {
  /** 英小文字・数字・アンダースコア。集約時の JSON スキーマのキーになる */
  id: string;
  label: string;
  /** 一次情報の RSS / Atom / RDF / HTML */
  urls: string[];
  /** 指定すると Google News の検索結果 RSS を収集源に足す（OR 検索・前日以降） */
  keywords: string[];
  /** 1通のメールに載せる最大件数。省略時は 8 */
  maxItems?: number;
  research?: ResearchSpec;
}

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * topics.yaml を読み、形の誤りを起動時に落とす。
 * 誤ったまま走らせると、LLM の呼び出し料金を払ったあとで空のメールが届くので、ここで止める。
 */
export function parseTopics(source: string): Topic[] {
  const doc = yaml.load(source) as { topics?: unknown } | undefined;
  if (!doc || !Array.isArray(doc.topics) || doc.topics.length === 0) {
    throw new Error('topics.yaml: topics に1件以上のトピックが必要です');
  }
  const seen = new Set<string>();
  return doc.topics.map((raw, i) => {
    const t = raw as Partial<Topic>;
    const where = `topics.yaml: topics[${i}]`;
    if (typeof t.id !== 'string' || !ID_PATTERN.test(t.id)) {
      throw new Error(`${where}: id は英小文字で始まる英小文字・数字・_ にしてください（${String(t.id)}）`);
    }
    if (seen.has(t.id)) throw new Error(`${where}: id "${t.id}" が重複しています`);
    seen.add(t.id);
    if (typeof t.label !== 'string' || !t.label) throw new Error(`${where}: label が必要です`);
    const urls = t.urls ?? [];
    const keywords = t.keywords ?? [];
    if (urls.length === 0 && keywords.length === 0 && !t.research) {
      throw new Error(`${where}: urls・keywords・research のどれも無いため、何も集められません`);
    }
    return { ...t, id: t.id, label: t.label, urls, keywords } as Topic;
  });
}

export function loadTopics(path: string): Topic[] {
  return parseTopics(readFileSync(path, 'utf8'));
}
