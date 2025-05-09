// src/scraper/tiendas/tienda-scraper.factory.ts
import { Injectable, Logger } from '@nestjs/common';
import { BaseTiendaScraper } from './base-tienda-scraper';
import { TiendaInfo } from '../interfaces/quimera-scraper.interface';
import { FootlockerScraper } from './footlocker-scraper';
import { JdSportsScraper } from './jdsports-scraper';

@Injectable()
export class TiendaScraperFactory {
  private readonly logger = new Logger(TiendaScraperFactory.name);

  createScraper(tiendaInfo: TiendaInfo): BaseTiendaScraper {
    const tiendaNombre = tiendaInfo.nombre.toLowerCase();
    const tiendaUrl = tiendaInfo.url.toLowerCase();

    this.logger.log(
      `Creando scraper para tienda: ${tiendaInfo.nombre} (ID: ${tiendaInfo.id})`,
    );

    // Determinar el tipo de scraper basado en el nombre o URL de la tienda
    if (
      tiendaNombre.includes('footlocker') ||
      tiendaUrl.includes('footlocker')
    ) {
      return new FootlockerScraper(tiendaInfo);
    }

    if (tiendaNombre.includes('jdsports') || tiendaUrl.includes('jdsports')) {
      return new JdSportsScraper(tiendaInfo);
    }

    // Si no hay un scraper específico, lanzar error
    this.logger.error(
      `No hay scraper implementado para la tienda ${tiendaInfo.nombre}`,
    );
    throw new Error(
      `No hay scraper implementado para la tienda ${tiendaInfo.nombre}`,
    );
  }
}
