import { Global, Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';

/** Plans, entitlements and usage limits shared by every module. */
@Global()
@Module({
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
