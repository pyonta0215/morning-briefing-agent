import type Anthropic from '@anthropic-ai/sdk';
import { collectResearch, formatResearch } from './collect/research.js';
import { fetchSource, sourcesFor, type CollectedSource } from './collect/sources.js';
import type { Config } from './config.js';
import { estimateCostUsd } from './cost.js';
import { isoDateIn, shiftIsoDate } from './date.js';
import { buildEmail, type BuiltEmail } from './email.js';
import { mergeHistory, recentTitles, type DeliveredItem, type HistoryStore } from './history.js';
import { selectItems } from './select.js';
import { buildPrompt, summarize } from './summarize.js';
import { normalizeUrl } from './url.js';

export interface BriefingDeps {
  llm: Pick<Anthropic, 'messages'>;
  history: HistoryStore;
  send: (email: BuiltEmail) => Promise<void>;
  fetchImpl?: typeof fetch;
  research?: typeof collectResearch;
  now?: Date;
}

export interface BriefingResult {
  email: BuiltEmail;
  itemCount: number;
  costUsd: number | null;
  sent: boolean;
}

/**
 * 1回分の流れ: 集める → LLM で1回だけ集約・採点 → コードで選ぶ → メールを組む → 送る → 履歴に残す。
 * 外部とのやり取り（取得・LLM・保存・送信）はすべて deps から受け取るので、テストで差し替えられる。
 */
export async function runBriefing(config: Config, deps: BriefingDeps): Promise<BriefingResult> {
  const now = deps.now ?? new Date();
  const todayIso = isoDateIn(now, config.timeZone);
  const history = await deps.history.load();
  const deliveredUrls = new Set(history.map((h) => normalizeUrl(h.url)));
  const since = new Date(now.getTime() - 2 * 86_400_000);

  const research = deps.research ?? collectResearch;
  const researchTopics = config.enableResearch ? config.topics.filter((t) => t.research) : [];
  const [fetched, researched] = await Promise.all([
    Promise.all(
      sourcesFor(config.topics, shiftIsoDate(todayIso, -1)).map((s) =>
        fetchSource(s, { since, excludeUrls: deliveredUrls, fetchImpl: deps.fetchImpl })
      )
    ),
    Promise.all(
      researchTopics.map(async (t): Promise<CollectedSource> => {
        const r = await research(t, deliveredUrls);
        if (r.errors.length) console.warn(JSON.stringify({ type: 'RESEARCH_PARTIAL', topic: t.id, errors: r.errors }));
        return {
          topicId: t.id,
          label: `${t.label}（HN / arXiv / GitHub / RSS）`,
          url: `research-hub://${t.id}`,
          content: formatResearch(r.items),
          ok: true,
        };
      })
    ),
  ]);
  const sources = [...fetched, ...researched];
  if (sources.every((s) => !s.ok)) throw new Error('すべての収集先で取得に失敗しました');

  const collected = sources
    .map((s) => `=== [トピックID: ${s.topicId}] ${s.label} (${s.url}) ===\n${s.content}`)
    .join('\n\n');
  const prompt = buildPrompt({ todayIso, topics: config.topics, collected, recentTitles: recentTitles(history, todayIso) });
  const { candidates, usage } = await summarize(deps.llm, config.model, config.topics, prompt);
  const costUsd = estimateCostUsd(usage, config.model);

  const { byTopic, stats } = selectItems(config.topics, candidates, deliveredUrls);
  const items = Object.values(byTopic).flat();
  console.log(JSON.stringify({ type: 'BRIEFING_SELECTED', items: items.length, ...stats, usage, costUsd }));

  const email = buildEmail({ isoDate: todayIso, title: config.title, topics: config.topics, byTopic });
  if (config.dryRun) {
    return { email, itemCount: items.length, costUsd, sent: false };
  }
  await deps.send(email);

  // 送れたものだけを履歴に入れる。送信前に保存すると、失敗した日の記事が翌日に出なくなる
  const delivered: DeliveredItem[] = items.map((i) => ({ url: i.url, title: i.title, topic: i.topic, isoDate: todayIso }));
  await deps.history.save(mergeHistory(history, delivered, todayIso));
  return { email, itemCount: items.length, costUsd, sent: true };
}
