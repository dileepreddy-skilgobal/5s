import { Module } from '@nestjs/common';
import { RedTagsController } from './red-tags.controller';
import { RedTagsService } from './red-tags.service';

@Module({
  controllers: [RedTagsController],
  providers: [RedTagsService],
  exports: [RedTagsService],
})
export class RedTagsModule {}
