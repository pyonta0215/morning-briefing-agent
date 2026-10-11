import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import path from 'node:path';
import { loadTopics, type Topic } from './topics.js';

export interface Config {
  recipient: string;
  sender: string;
  sesRegion: string;
  model: string;
  timeZone: string;
  title: string;
  /** 配信履歴を置くバケット。無ければ履歴なし（毎日すべて新着扱い） */
  bucket?: string;
  dryRun: boolean;
  enableResearch: boolean;
  topics: Topic[];
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const v = env[key]?.trim();
  if (!v) throw new Error(`環境変数 ${key} が必要です（.env.example を参照）`);
  return v;
}

/**
 * 設定はすべて環境変数から読む。秘密情報（API キー）はファイルにもリポジトリにも置かない。
 * dryRun のときは送信しないので、宛先が無くても動く。
 */
export function loadConfig(env: Env = process.env): Config {
  const dryRun = env.DRY_RUN === 'true';
  const topicsPath = env.TOPICS_FILE ?? path.resolve(env.LAMBDA_TASK_ROOT ?? process.cwd(), 'topics.yaml');
  return {
    recipient: dryRun ? (env.RECIPIENT_EMAIL ?? '') : required(env, 'RECIPIENT_EMAIL'),
    sender: dryRun ? (env.SENDER_EMAIL ?? '') : required(env, 'SENDER_EMAIL'),
    sesRegion: env.SES_REGION ?? env.AWS_REGION ?? 'ap-northeast-1',
    model: env.MODEL ?? 'claude-haiku-5-5',
    timeZone: env.TIME_ZONE ?? 'Asia/Tokyo',
    title: env.BRIEFING_TITLE ?? '朝のブリーフィング',
    bucket: env.HISTORY_BUCKET || undefined,
    dryRun,
    enableResearch: env.ENABLE_RESEARCH_HUB !== 'false',
    topics: loadTopics(topicsPath),
  };
}

/**
 * ANTHROPIC_API_KEY が無ければ SSM Parameter Store（SecureString）から読む。
 * Lambda の環境変数に鍵の値を置かず、パラメータ名だけを渡すため。
 */
export async function ensureApiKey(env: Env = process.env): Promise<void> {
  if (env.ANTHROPIC_API_KEY) return;
  const name = env.ANTHROPIC_API_KEY_PARAMETER;
  if (!name) throw new Error('ANTHROPIC_API_KEY か ANTHROPIC_API_KEY_PARAMETER のどちらかが必要です');
  const ssm = new SSMClient({});
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = res.Parameter?.Value;
  if (!value) throw new Error(`SSM パラメータ ${name} が空です`);
  process.env.ANTHROPIC_API_KEY = value;
}
