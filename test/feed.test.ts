import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatEntries, htmlToText, isFeed, parseFeed } from '../src/collect/feed.js';
import { normalizeUrl } from '../src/url.js';

// RDF は名前空間宣言が長く、<channel> が先頭200字の外に出る
const RDF_HEAD =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" ' +
  'xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
  'xmlns:content="http://purl.org/rss/1.0/modules/content/" xml:lang="ja">\n';

test('isFeed は RSS 2.0・Atom・RDF をフィードと判定する', () => {
  assert.ok(RDF_HEAD.length > 200);
  assert.ok(isFeed(`${RDF_HEAD}<channel rdf:about="x"></channel></rdf:RDF>`));
  assert.ok(isFeed('\n  <rss version="2.0"><channel></channel></rss>'));
  assert.ok(isFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>'));
});

test('isFeed は RSS 自動検出リンクを持つ HTML をフィードにしない', () => {
  assert.equal(
    isFeed('<!DOCTYPE html><html><head><link type="application/rss+xml" href="/feed"></head></html>'),
    false
  );
  assert.equal(isFeed('<html><head><feed></feed></head></html>'), false);
  assert.equal(isFeed('取得に失敗しました'), false);
});

const rdf =
  `${RDF_HEAD}<channel rdf:about="https://example.jp/"><title>一覧</title></channel>\n` +
  '<item rdf:about="https://example.jp/new"><title>新しい案件</title><link>https://example.jp/new</link>' +
  '<dc:date>2026-10-10T09:00:00+09:00</dc:date><description>意見募集について</description></item>\n' +
  '<item rdf:about="https://example.jp/old"><title>古い案件</title><link>https://example.jp/old</link>' +
  '<dc:date>2026-09-01T09:00:00+09:00</dc:date></item>\n' +
  '<item><title>日付なし</title><link>https://example.jp/nodate</link></item>\n</rdf:RDF>';

test('parseFeed は RDF の dc:date で古い記事を落とし、日付の無い記事は残す', () => {
  const entries = parseFeed(rdf, { since: new Date('2026-10-09T00:00:00Z') });
  assert.deepEqual(
    entries.map((e) => e.url),
    ['https://example.jp/new', 'https://example.jp/nodate']
  );
  assert.equal(entries[0].pubDate, '2026-10-10T09:00:00+09:00');
  assert.equal(entries[0].description, '意見募集について');
});

test('parseFeed は配信済みURLを落とす（トラッキングパラメータの違いは同一視）', () => {
  const body = '<rss><channel><item><title>a</title><link>https://x.test/a?utm_source=rss</link></item></channel></rss>';
  assert.equal(parseFeed(body, { excludeUrls: new Set([normalizeUrl('https://x.test/a')]) }).length, 0);
});

test('parseFeed は CDATA・エスケープされた HTML・Atom の href を読む', () => {
  const rss =
    '<rss><channel><item><title><![CDATA[A &amp; B]]></title><link>https://x.test/1</link>' +
    '<description>&lt;p&gt;本文&lt;/p&gt;</description></item></channel></rss>';
  const [e] = parseFeed(rss);
  assert.equal(e.title, 'A & B');
  assert.equal(e.description, '本文');
  const atom = '<feed><entry><title>t</title><link href="https://y.test/1"/><updated>2026-10-10T00:00:00Z</updated></entry></feed>';
  assert.equal(parseFeed(atom)[0].url, 'https://y.test/1');
});

test('parseFeed は maxItems で打ち切る', () => {
  const items = Array.from({ length: 5 }, (_, i) => `<item><title>${i}</title><link>https://z.test/${i}</link></item>`);
  assert.equal(parseFeed(`<rss>${items.join('')}</rss>`, { maxItems: 2 }).length, 2);
});

test('formatEntries は LLM に渡す体裁にする', () => {
  assert.equal(formatEntries([]), '（新着記事はありませんでした）');
  assert.equal(
    formatEntries([{ url: 'https://a', title: 't', pubDate: 'd' }]),
    '[記事1]\nタイトル: t\nURL: https://a\n日付: d'
  );
});

test('htmlToText は script・nav を落としてテキストにする', () => {
  assert.equal(htmlToText('<nav>menu</nav><p>Hello&nbsp;<b>world</b></p><script>x()</script>'), 'Hello world');
});
