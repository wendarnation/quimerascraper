// src/scraper-cli.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ScraperService } from './scraper/scraper.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('ScraperCLI');
  logger.log('Iniciando CLI de scraper...');

  try {
    // Crear la aplicación NestJS
    const app = await NestFactory.createApplicationContext(AppModule);
    const scraperService = app.get(ScraperService);

    // Obtener argumentos de la línea de comandos
    const args = process.argv.slice(2);
    const command = args[0];

    logger.log(`Ejecutando comando: ${command}`);

    switch (command) {
      case 'scrape:all':
        // Ejecutar scraper para todas las tiendas
        logger.log('Ejecutando scraper para todas las tiendas...');
        const maxItems = args[1] ? parseInt(args[1]) : undefined;
        const result = await scraperService.runScraperForAllTiendas({
          maxItems,
          headless: true,
        });
        logger.log(
          `Scraping completado. Se procesaron ${result.tiendas_procesadas} tiendas`,
        );
        break;

      case 'scrape:tienda':
        // Ejecutar scraper para una tienda específica
        const tiendaId = parseInt(args[1]);
        if (isNaN(tiendaId)) {
          logger.error('Error: Debes proporcionar un ID de tienda válido');
          break;
        }

        logger.log(`Ejecutando scraper para tienda ID: ${tiendaId}`);
        const tiendaResult = await scraperService.runScraper({
          tiendaId,
          options: {
            maxItems: args[2] ? parseInt(args[2]) : undefined,
            headless: true,
          },
        });

        logger.log(
          `Scraping completado. Se procesaron ${tiendaResult.total} productos`,
        );
        break;

      case 'tiendas':
        // Obtener lista de tiendas
        logger.log('Obteniendo lista de tiendas...');
        const tiendas = await scraperService.getTiendas();
        logger.log(`Tiendas disponibles (${tiendas.length}):`);
        tiendas.forEach((tienda) => {
          logger.log(`- ${tienda.id}: ${tienda.nombre}`);
        });
        break;

      default:
        logger.error('Comando no reconocido');
        logger.log('Comandos disponibles:');
        logger.log(
          '  scrape:all [maxItems] - Ejecutar scraper para todas las tiendas',
        );
        logger.log(
          '  scrape:tienda <tiendaId> [maxItems] - Ejecutar scraper para una tienda específica',
        );
        logger.log('  tiendas - Obtener lista de tiendas disponibles');
    }

    // Cerrar la aplicación
    await app.close();
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

bootstrap();
