import { Module } from '@nestjs/common';
import { PlatformController, SubscriptionController } from './platform.controller';

@Module({
  controllers: [PlatformController, SubscriptionController],
})
export class PlatformModule {}
