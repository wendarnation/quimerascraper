// src/scraper/scraper.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { TiendaScraperFactory } from './tiendas/tienda-scraper.factory';
import { ApiService } from './api/api.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 60000, // 60 segundos de timeout para peticiones HTTP
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [ScraperController],
  providers: [ScraperService, TiendaScraperFactory, ApiService],
  exports: [ScraperService],
})
export class ScraperModule {}
