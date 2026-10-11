#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BriefingStack } from '../lib/briefingStack.js';

const app = new cdk.App();
const env = (key: string, fallback?: string): string => {
  const v = process.env[key] || fallback;
  if (!v) throw new Error(`環境変数 ${key} が必要です（README の「デプロイ」を参照）`);
  return v;
};

new BriefingStack(app, 'MorningBriefingAgent', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  recipientEmail: env('RECIPIENT_EMAIL'),
  senderEmail: env('SENDER_EMAIL'),
  sesRegion: process.env.SES_REGION,
  apiKeyParameterName: env('ANTHROPIC_API_KEY_PARAMETER', '/morning-briefing-agent/anthropic-api-key'),
  // 既定は毎朝 6:30（Asia/Tokyo）
  scheduleExpression: env('SCHEDULE', 'cron(30 6 * * ? *)'),
  scheduleTimeZone: env('TIME_ZONE', 'Asia/Tokyo'),
  model: process.env.MODEL,
  title: process.env.BRIEFING_TITLE,
});
