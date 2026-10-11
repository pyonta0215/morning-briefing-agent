import type Anthropic from '@anthropic-ai/sdk';
import type { Topic } from './topics.js';

/** 集約の出力1件。score は 5=一次情報の重大発表 … 1=無関係寄り */
export interface Candidate {
  url: string;
  title: string;
  summary: string;
  score: number;
}

export type CandidatesByTopic = Record<string, Candidate[]>;

/**
 * 集約の JSON スキーマ。トピック id をキーにし、全トピックを required にする。
 * 「特定のトピックだけ返して他を落とす」崩れ方を、生成の段階で構造的に防ぐため。
 * 該当が無いトピックは空配列を許す（minItems を課すと記事を創作させる圧になる）。
 */
export function buildSummaryFormat(topics: Topic[]): Anthropic.JSONOutputFormat {
  const item = {
    type: 'object',
    properties: {
      url: { type: 'string' },
      title: { type: 'string' },
      summary: { type: 'string', description: '2〜3文の要約' },
      score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    },
    required: ['url', 'title', 'summary', 'score'],
    additionalProperties: false,
  };
  return {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: Object.fromEntries(topics.map((t) => [t.id, { type: 'array', items: item }])),
      required: topics.map((t) => t.id),
      additionalProperties: false,
    },
  } as Anthropic.JSONOutputFormat;
}

export interface PromptInput {
  todayIso: string;
  topics: Topic[];
  /** `=== [トピックID: x] ラベル (url) ===` で区切った収集テキスト */
  collected: string;
  /** 直近に配信した見出し。同じ話題の再掲を避けるために見せる */
  recentTitles: string[];
}

export function buildPrompt(p: PromptInput): string {
  const delivered =
    p.recentTitles.length > 0
      ? `\n【配信済みの記事】\n${p.recentTitles.map((t) => `・${t}`).join('\n')}\n上と同じ、または実質同じ内容の記事は選ばないでください。重要な進展がある場合だけ、タイトルの先頭に「続報：」を付けて選んでください。\n`
      : '';
  return `今日は ${p.todayIso} です。以下の収集データをもとに、全トピック（${p.topics
    .map((t) => t.id)
    .join(', ')}）それぞれについて候補記事を網羅的に列挙し、重要度スコア（1-5）を付けてください。件数を自分で絞らないでください（掲載するかは後段で機械的に決めます）。
- スコア基準: 5=一次情報の重大発表 / 4=注目に値する進展 / 3=通常ニュース / 2=軽微 / 1=無関係寄り
- 2日以上前と明示されている記事は含めないでください。日付が分からない記事は最新として扱ってください。
- 各トピックには、そのトピックの収集データに実在する記事だけを入れてください（記事を創作しないこと）。該当が無いトピックだけ空配列にしてください。
${delivered}
収集データ:
${p.collected}`;
}

export interface SummarizeResult {
  candidates: CandidatesByTopic;
  usage: { input_tokens: number; output_tokens: number };
}

/** LLM を呼ぶのはここ1か所だけ。選別・重複排除・メールの組み立ては決定的なコードで行う */
export async function summarize(
  client: Pick<Anthropic, 'messages'>,
  model: string,
  topics: Topic[],
  prompt: string
): Promise<SummarizeResult> {
  const res = await client.messages.create({
    model,
    max_tokens: 16000,
    system: 'あなたはニュース編集者です。収集した情報をトピックごとに整理し、各記事に重要度スコアを付けて出力してください。',
    output_config: { format: buildSummaryFormat(topics), effort: 'low' },
    messages: [{ role: 'user', content: prompt }],
  });
  const text = res.content.find((c) => c.type === 'text');
  if (!text || text.type !== 'text') throw new Error('集約の応答にテキストがありません');
  return { candidates: JSON.parse(text.text) as CandidatesByTopic, usage: res.usage };
}
