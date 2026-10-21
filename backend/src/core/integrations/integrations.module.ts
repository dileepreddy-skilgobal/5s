import { Global, Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { WebhooksService } from './webhooks.service';

/** API keys and outbound webhooks. */
@Global()
@Module({
  providers: [ApiKeysService, WebhooksService],
  exports: [ApiKeysService, WebhooksService],
})
export class IntegrationsCoreModule {}
