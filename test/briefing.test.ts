import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBriefing } from '../src/briefing.js';
import type { Config } from '../src/config.js';
import type { BuiltEmail } from '../src/email.js';
import { memoryHistoryStore, type DeliveredItem } from '../src/history.js';
import { fakeFetch, fakeLlm } from './fakes.js';

const NOW = new Date('2026-10-10T21:30:00Z'); // 2026-10-11 06:30 JST

const config: Config = {
  recipient: 'to@example.com',
  sender: 'from@example.com',
  sesRegion: 'ap-northeast-1',
  model: 'claude-haiku-5-5',
  timeZone: 'Asia/Tokyo',
  title: '朝のブリーフィング',
  dryRun: false,
  enableResearch: false,
  topics: [{ id: 'ai', label: 'AI', urls: ['https://feed.test/ai.xml'], keywords: [] }],
};

const FEED =
  '<rss><channel>' +
  '<item><title>新しい記事</title><link>https://news.test/new</link><pubDate>Sat, 10 Oct 2026 12:00:00 GMT</pubDate></item>' +
  '<item><title>昨日送った記事</title><link>https://news.test/old</link><pubDate>Sat, 10 Oct 2026 01:00:00 GMT</pubDate></item>' +
  '</channel></rss>';

const llmOutput = {
  ai: [
    { url: 'https://news.test/new', title: '新しい記事', summary: '要約', score: 5 },
    { url: 'https://news.test/old', title: '昨日送った記事', summary: '要約', score: 5 },
  ],
};

const yesterday: DeliveredItem = { url: 'https://news.test/old', title: '昨日送った記事', topic: 'ai', isoDate: '2026-10-10' };

test('集めて採点し、配信済みを除いて送り、送ったものを履歴に足す', async () => {
  const history = memoryHistoryStore([yesterday]);
  const sent: BuiltEmail[] = [];
  const { llm, requests } = fakeLlm(llmOutput);
  const result = await runBriefing(config, {
    llm,
    history,
    send: async (e) => void sent.push(e),
    fetchImpl: fakeFetch({ 'https://feed.test/ai.xml': FEED }),
    now: NOW,
  });

  assert.equal(result.sent, true);
  assert.equal(result.itemCount, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /2026年10月11日（日） 1件/);

  // 配信済みの記事はフィードの段階で落ち、LLM には見出しとしてだけ伝わる
  const prompt = String(requests[0].messages[0].content);
  assert.ok(prompt.includes('URL: https://news.test/new'));
  assert.ok(!prompt.includes('URL: https://news.test/old'));
  assert.ok(prompt.includes('・昨日送った記事'));

  const saved = await history.load();
  assert.deepEqual(saved.map((h) => [h.url, h.isoDate]), [
    ['https://news.test/old', '2026-10-10'],
    ['https://news.test/new', '2026-10-11'],
  ]);
});

test('送信に失敗したら履歴を更新しない（翌日に同じ記事をもう一度送れる）', async () => {
  const history = memoryHistoryStore([]);
  await assert.rejects(
    runBriefing(config, {
      llm: fakeLlm(llmOutput).llm,
      history,
      send: async () => {
        throw new Error('SES down');
      },
      fetchImpl: fakeFetch({ 'https://feed.test/ai.xml': FEED }),
      now: NOW,
    }),
    /SES down/
  );
  assert.deepEqual(await history.load(), []);
});

test('DRY_RUN は送らず、履歴も変えない', async () => {
  const history = memoryHistoryStore([]);
  let sent = 0;
  const result = await runBriefing(
    { ...config, dryRun: true },
    {
      llm: fakeLlm(llmOutput).llm,
      history,
      send: async () => void sent++,
      fetchImpl: fakeFetch({ 'https://feed.test/ai.xml': FEED }),
      now: NOW,
    }
  );
  assert.equal(result.sent, false);
  assert.equal(sent, 0);
  assert.deepEqual(await history.load(), []);
});

test('すべての収集先が失敗したら LLM を呼ばずに止まる', async () => {
  const { llm, requests } = fakeLlm(llmOutput);
  await assert.rejects(
    runBriefing(config, {
      llm,
      history: memoryHistoryStore(),
      send: async () => {},
      fetchImpl: fakeFetch({ 'https://feed.test/ai.xml': 503 }),
      now: NOW,
    }),
    /すべての収集先で取得に失敗/
  );
  assert.equal(requests.length, 0);
});

test('research-hub の結果を同じ体裁で LLM に渡す', async () => {
  const { llm, requests } = fakeLlm({ ai: [] });
  await runBriefing(
    {
      ...config,
      enableResearch: true,
      topics: [{ ...config.topics[0], research: { search: { queries: ['Claude'] } } }],
    },
    {
      llm,
      history: memoryHistoryStore(),
      send: async () => {},
      fetchImpl: fakeFetch({ 'https://feed.test/ai.xml': FEED }),
      research: async () => ({
        items: [{ id: 'hackernews:1', source: 'hackernews', type: 'discussion', title: 'HN の記事', url: 'https://hn.test/1', score: 120 }],
        errors: [],
      }),
      now: NOW,
    }
  );
  const prompt = String(requests[0].messages[0].content);
  assert.ok(prompt.includes('research-hub://ai'));
  assert.ok(prompt.includes('タイトル: HN の記事'));
  assert.ok(prompt.includes('hackernews / スコア120'));
});
