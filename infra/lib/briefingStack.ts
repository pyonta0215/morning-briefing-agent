import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BriefingStackProps extends cdk.StackProps {
  recipientEmail: string;
  senderEmail: string;
  sesRegion?: string;
  /** SecureString の名前。値（API キー）はスタックにもリポジトリにも入れない */
  apiKeyParameterName: string;
  scheduleExpression: string;
  scheduleTimeZone: string;
  model?: string;
  title?: string;
}

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');

export class BriefingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BriefingStackProps) {
    super(scope, id, props);

    // 配信履歴だけを置く。失っても「重複が数日出る」だけなので、スタック削除で一緒に消す
    const bucket = new s3.Bucket(this, 'HistoryBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const fn = new lambda.Function(this, 'BriefingFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(distDir),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      // 暴走しても同時に1つしか動かない。止めたいときは 0 にすれば止まる
      reservedConcurrentExecutions: 1,
      logGroup: new logs.LogGroup(this, 'BriefingLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        RECIPIENT_EMAIL: props.recipientEmail,
        SENDER_EMAIL: props.senderEmail,
        SES_REGION: props.sesRegion ?? this.region,
        ANTHROPIC_API_KEY_PARAMETER: props.apiKeyParameterName,
        HISTORY_BUCKET: bucket.bucketName,
        TIME_ZONE: props.scheduleTimeZone,
        TOPICS_FILE: '/var/task/topics.yaml',
        // バンドル後は research-hub-mcp が購読リストの場所を自分で解決できないため明示する
        RESEARCH_HUB_FEEDS: '/var/task/feeds.json',
        // 1日1回の実行ではキャッシュを再利用する余地が無い
        RESEARCH_HUB_CACHE: 'off',
        ...(props.model ? { MODEL: props.model } : {}),
        ...(props.title ? { BRIEFING_TITLE: props.title } : {}),
      },
    });

    bucket.grantReadWrite(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/${props.apiKeyParameterName.replace(/^\//, '')}`,
        ],
      })
    );
    // 送信元アドレス（SES の検証済み ID）からだけ送れる
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: ['*'],
        conditions: { StringEquals: { 'ses:FromAddress': props.senderEmail } },
      })
    );

    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    fn.grantInvoke(schedulerRole);
    new scheduler.CfnSchedule(this, 'DailySchedule', {
      scheduleExpression: props.scheduleExpression,
      scheduleExpressionTimezone: props.scheduleTimeZone,
      flexibleTimeWindow: { mode: 'OFF' },
      target: { arn: fn.functionArn, roleArn: schedulerRole.roleArn, retryPolicy: { maximumRetryAttempts: 0 } },
    });

    new cdk.CfnOutput(this, 'FunctionName', { value: fn.functionName });
  }
}
