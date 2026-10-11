import { normalizeUrl } from '../url.js';

/**
 * RSS / Atom / RSS 1.0（RDF）かどうか。
 *
 * RDF は名前空間宣言が長く、`<channel>` が先頭200字の外に出ることがある。窓を広げるかわりに、
 * HTML を先に弾く（HTML の `<head>` には RSS 自動検出用の `<link type="application/rss+xml">` が入りうる）。
 */
export function isFeed(body: string): boolean {
  const head = body.trimStart().slice(0, 1000);
  if (/^<(?:!doctype\s+html|html)\b/i.test(head)) return false;
  return /<(?:rss|feed|rdf:RDF|channel)[\s>]/i.test(head);
}

export interface FeedEntry {
  url: string;
  title: string;
  pubDate?: string;
  description?: string;
}

export interface ParseFeedOptions {
  maxItems?: number;
  /** これより古い記事を落とす。日付が読めない記事は最新として残す */
  since?: Date;
  /** 正規化済みURLの集合。配信済みの記事を LLM に渡す前に落とす */
  excludeUrls?: ReadonlySet<string>;
}

/** `<item>` / `<entry>` を取り出す。依存を増やさないため正規表現で読む（壊れたフィードでも落ちない） */
export function parseFeed(body: string, options: ParseFeedOptions = {}): FeedEntry[] {
  const { maxItems = 10, since, excludeUrls } = options;
  const entries: FeedEntry[] = [];
  const itemPattern = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(body)) !== null && entries.length < maxItems) {
    const block = match[1];
    const title = decode(extractTag(block, 'title'));
    const url = extractTag(block, 'link') || extractAttr(block, 'link', 'href') || extractTag(block, 'guid');
    if (!title && !url) continue;
    // RSS 2.0 は pubDate、Atom は published/updated、RDF は dc:date
    const pubDate =
      extractTag(block, 'pubDate') ||
      extractTag(block, 'published') ||
      extractTag(block, 'dc:date') ||
      extractTag(block, 'updated');
    if (since && pubDate) {
      const d = new Date(pubDate);
      if (!Number.isNaN(d.getTime()) && d < since) continue;
    }
    if (excludeUrls && url && excludeUrls.has(normalizeUrl(url))) continue;
    const description = stripTags(
      decode(extractTag(block, 'description') || extractTag(block, 'summary'))
    ).slice(0, 200);
    entries.push({ url, title, pubDate: pubDate || undefined, description: description || undefined });
  }
  return entries;
}

/** LLM に渡す体裁。フィードでも research-hub でも同じ形に揃え、プロンプトを1つにする */
export function formatEntries(entries: FeedEntry[]): string {
  if (entries.length === 0) return '（新着記事はありませんでした）';
  return entries
    .map((e, i) =>
      [
        `[記事${i + 1}]`,
        `タイトル: ${e.title}`,
        `URL: ${e.url}`,
        e.pubDate ? `日付: ${e.pubDate}` : '',
        e.description ? `概要: ${e.description}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');
}

export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string {
  const m =
    block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i')) ||
    block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function extractAttr(block: string, tag: string, attr: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`, 'i'));
  return m ? m[1].trim() : '';
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => codePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m);
}

function codePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return ' ';
  }
}
