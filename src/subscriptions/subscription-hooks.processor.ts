import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SUBSCRIPTION_HOOKS_QUEUE } from '../queues/subscription-hooks.queue';

export interface SubscriptionHookJobPayload {
  readonly subscriptionId: string;
  readonly userId: string;
}

@Injectable()
@Processor(SUBSCRIPTION_HOOKS_QUEUE)
export class SubscriptionHooksProcessor extends WorkerHost {
  constructor(
    @InjectPinoLogger(SubscriptionHooksProcessor.name)
    private readonly log: PinoLogger,
  ) {
    super();
  }

  async process(job: Job<SubscriptionHookJobPayload>): Promise<void> {
    this.log.info(
      {
        jobId: job.id,
        subscriptionId: job.data.subscriptionId,
        userId: job.data.userId,
      },
      'subscription_hooks_processed',
    );
  }
}
