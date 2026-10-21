import { Module } from '@nestjs/common';
import { DuplicatesController, OnboardingController, SearchController } from './workspace.controller';

@Module({
  controllers: [SearchController, DuplicatesController, OnboardingController],
})
export class WorkspaceModule {}
