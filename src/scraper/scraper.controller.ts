// src/scraper/scraper.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  ParseIntPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { RunScraperDto } from './dto/scraper.dto';
import { TiendaInfo } from './interfaces/quimera-scraper.interface';

// Definición de interfaces para los resultados
interface ResultadoZapatilla {
  success: boolean;
  zapatilla: {
    marca: string;
    modelo: string;
    sku: string;
    id?: number;
  };
  tallas_procesadas?: number;
  error?: string;
}

interface ResultadoTienda {
  tienda: string;
  success: boolean;
  total?: number;
  error?: string;
}

interface ResultadoScraper {
  success: boolean;
  tienda: {
    id: number;
    nombre: string;
  };
  total: number;
  resultados: ResultadoZapatilla[];
}

interface ResultadoScraperAll {
  success: boolean;
  tiendas_procesadas: number;
  resultados: ResultadoTienda[];
}

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('run')
  async runScraper(@Body() params: RunScraperDto): Promise<ResultadoScraper> {
    try {
      return await this.scraperService.runScraper(params);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al ejecutar el scraper',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('tiendas')
  async getTiendas(): Promise<TiendaInfo[]> {
    try {
      return await this.scraperService.getTiendas();
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al obtener tiendas',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('run-all')
  async runScraperForAllTiendas(
    @Query('maxItems', new ParseIntPipe({ optional: true })) maxItems?: number,
    @Query('headless') headless?: string,
  ): Promise<ResultadoScraperAll> {
    try {
      const options: any = {};

      if (maxItems !== undefined) {
        options.maxItems = maxItems;
      }

      if (headless !== undefined) {
        options.headless = headless === 'true';
      }

      return await this.scraperService.runScraperForAllTiendas(options);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al ejecutar el scraper para todas las tiendas',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status')
  getStatus(): { isRunning: boolean } {
    return this.scraperService.getStatus();
  }
}
