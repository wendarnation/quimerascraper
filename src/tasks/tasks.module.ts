// src/tasks/tasks.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [ScheduleModule.forRoot(), ScraperModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
