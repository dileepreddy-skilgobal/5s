import { Module } from '@nestjs/common';
import { ApiKeysController, WebhooksController } from './integrations.controller';

@Module({
  controllers: [ApiKeysController, WebhooksController],
})
export class IntegrationsModule {}
