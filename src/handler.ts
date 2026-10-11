import Anthropic from '@anthropic-ai/sdk';
import { S3Client } from '@aws-sdk/client-s3';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { runBriefing } from './briefing.js';
import { ensureApiKey, loadConfig } from './config.js';
import { memoryHistoryStore, s3HistoryStore } from './history.js';

/** EventBridge Scheduler から毎朝1回呼ばれる */
export const handler = async (): Promise<void> => {
  const config = loadConfig();
  await ensureApiKey();
  const ses = new SESClient({ region: config.sesRegion });
  const result = await runBriefing(config, {
    llm: new Anthropic(),
    history: config.bucket ? s3HistoryStore(new S3Client({}), config.bucket) : memoryHistoryStore(),
    send: async (email) => {
      await ses.send(
        new SendEmailCommand({
          Source: config.sender,
          Destination: { ToAddresses: [config.recipient] },
          Message: {
            Subject: { Data: email.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: email.html, Charset: 'UTF-8' }, Text: { Data: email.text, Charset: 'UTF-8' } },
          },
        })
      );
    },
  });
  console.log(JSON.stringify({ type: 'BRIEFING_DONE', items: result.itemCount, costUsd: result.costUsd, sent: result.sent }));
};
