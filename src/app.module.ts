// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScraperModule } from './scraper/scraper.module';
import { TasksModule } from './tasks/tasks.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
    ScraperModule,
    TasksModule,
  ],
})
export class AppModule {}
