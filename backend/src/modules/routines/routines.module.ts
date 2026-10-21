import { Module } from '@nestjs/common';
import { ObservationsModule } from '../observations/observations.module';
import { RoutinesController } from './routines.controller';
import { RoutinesService } from './routines.service';

@Module({
  imports: [ObservationsModule],
  controllers: [RoutinesController],
  providers: [RoutinesService],
})
export class RoutinesModule {}
