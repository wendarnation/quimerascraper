// src/scraper/scraper.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TiendaScraperFactory } from './tiendas/tienda-scraper.factory';
import {
  ZapatillaScraped,
  TiendaInfo,
} from './interfaces/quimera-scraper.interface';
import { RunScraperDto } from './dto/scraper.dto';
import { ApiService } from './api/api.service';

// Interfaces para resultados
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
  zapatillasGuardadas?: number;
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
  zapatillas_totales?: number;
  zapatillas_guardadas?: number;
}

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private runningScrapers: Map<number, boolean> = new Map(); // Para controlar scrapers por tienda
  private isGlobalRunning: boolean = false; // Para control global

  constructor(
    private readonly apiService: ApiService,
    private readonly scraperFactory: TiendaScraperFactory,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Limpia completamente la base de datos (tallas y zapatillas-tienda)
   */
  async limpiarBaseDatos(): Promise<void> {
    try {
      this.logger.log('Limpiando completamente la base de datos...');
      
      // 1. Primero obtener todas las relaciones zapatilla-tienda
      const zapatillasTienda = await this.apiService.makeAuthenticatedRequest(
        'get',
        '/zapatillas-tienda',
      );
      
      if (zapatillasTienda && zapatillasTienda.length > 0) {
        this.logger.log(`Encontradas ${zapatillasTienda.length} relaciones zapatilla-tienda para eliminar`);
        
        // 2. Para cada zapatilla-tienda, eliminar sus tallas
        for (const zt of zapatillasTienda) {
          try {
            // Eliminar las tallas asociadas
            const tallas = await this.apiService.makeAuthenticatedRequest(
              'get',
              `/tallas?zapatilla_tienda_id=${zt.id}`,
            );
            
            if (tallas && tallas.length > 0) {
              this.logger.log(`Eliminando ${tallas.length} tallas para zapatilla-tienda ID=${zt.id}`);
              
              for (const talla of tallas) {
                await this.apiService.makeAuthenticatedRequest(
                  'delete',
                  `/tallas/${talla.id}`,
                );
              }
            }
            
            // Eliminar la relación zapatilla-tienda
            await this.apiService.makeAuthenticatedRequest(
              'delete',
              `/zapatillas-tienda/${zt.id}`,
            );
            
            this.logger.log(`Eliminada relación zapatilla-tienda ID=${zt.id}`);
          } catch (error) {
            this.logger.error(`Error al eliminar zapatilla-tienda ID=${zt.id}: ${error.message}`);
          }
        }
      } else {
        this.logger.log('No hay relaciones zapatilla-tienda para eliminar');
      }
      
      this.logger.log('Base de datos limpiada con éxito');
    } catch (error) {
      this.logger.error(`Error al limpiar la base de datos: ${error.message}`);
    }
  }

  /**
   * Ejecuta el scraper para una tienda específica
   * VERSIÓN MEJORADA: mejor manejo de errores, reintentos y seguimiento
   */
  async runScraper(params: RunScraperDto): Promise<ResultadoScraper> {
    const { tiendaId, options } = params;

    // Verificar si esta tienda específica ya está en proceso
    const isRunning = this.runningScrapers.get(tiendaId);
    this.logger.log(`Comprobando estado del scraper para tienda ID ${tiendaId}: ${isRunning ? 'En ejecución' : 'Inactivo'}`);
    
    if (isRunning) {
      // Opción 1: Forzar reinicio del estado (más agresivo)
      this.logger.log(`Detectado scraper en ejecución para tienda ID ${tiendaId}. Forzando reinicio...`);
      this.runningScrapers.set(tiendaId, false);
      this.logger.log(`Estado del scraper para tienda ID ${tiendaId} reiniciado.`);
      
      // Opción 2: Lanzar error (más conservador)
      // throw new BadRequestException(
      //   `Ya hay un proceso de scraping en ejecución para la tienda ID ${tiendaId}`,
      // );
    }

    // Usar la variable de entorno si no se proporciona la opción maxItems
    let scraperOptions = options;
    if (!scraperOptions) scraperOptions = {};
    if (scraperOptions.maxItems === undefined) {
      const envMaxItems = parseInt(this.configService.get('SCRAPER_MAX_ITEMS') || '50', 10);
      scraperOptions.maxItems = isNaN(envMaxItems) ? 50 : envMaxItems;
    }

    try {
      // Marcar esta tienda como en ejecución
      this.runningScrapers.set(tiendaId, true);

      // Obtener información de las tiendas
      const tiendas = await this.apiService.getTiendas();
      const tienda = tiendas.find((t) => t.id === tiendaId);

      if (!tienda) {
        throw new NotFoundException(
          `No se encontró la tienda con ID ${tiendaId}`,
        );
      }

      // Registrar inicio del proceso y configuración
      this.logger.log('='.repeat(80));
      this.logger.log(`INICIO DE SCRAPING PARA TIENDA: ${tienda.nombre} (ID: ${tienda.id})`);
      this.logger.log(`URL de la tienda: ${tienda.url}`);
      this.logger.log(`Configuración: maxItems=${scraperOptions.maxItems}, headless=${scraperOptions.headless !== false}`);
      this.logger.log('='.repeat(80));

      // Limpiamos datos existentes para evitar problemas con restricciones únicas
      // Deshabilitar la limpieza completa, para evitar eliminar datos existentes
      this.logger.log(`MODO CONSERVADOR: Omitiendo limpieza de datos previos para preservar relaciones existentes.`);
      this.logger.log(`Las zapatillas existentes serán actualizadas en lugar de eliminadas`);
      
      // No hacemos nada, solo dejamos el mensaje en el log

      const tiendaInfo: TiendaInfo = {
        id: tienda.id,
        nombre: tienda.nombre,
        url: tienda.url,
      };

      // Crear el scraper adecuado para la tienda con manejo de errores mejorado
      let scraper;
      try {
        scraper = this.scraperFactory.createScraper(tiendaInfo);
        
        // Configurar opciones del scraper
        if (scraperOptions) {
          scraper.setOptions(scraperOptions);
        }
        
        this.logger.log(`Scraper para ${tienda.nombre} creado correctamente`);
      } catch (scraperError) {
        this.logger.error(`Error al crear scraper: ${scraperError.message}`);
        throw new Error(`No se pudo inicializar el scraper para ${tienda.nombre}: ${scraperError.message}`);
      }

      // Ejecutar el scraper con reintentos
      let zapatillasScraped: ZapatillaScraped[] = [];
      let intentosScraping = 0;
      const maxIntentosScraping = 2;
      let errorScraping = null;
      
      while (intentosScraping < maxIntentosScraping && zapatillasScraped.length === 0) {
        intentosScraping++;
        try {
          this.logger.log(`Ejecutando scraper (intento ${intentosScraping}/${maxIntentosScraping})...`);
          
          // Medir tiempo de ejecución
          const tiempoInicio = Date.now();
          zapatillasScraped = await scraper.scrapeZapatillas();
          const tiempoFin = Date.now();
          const duracionSegundos = ((tiempoFin - tiempoInicio) / 1000).toFixed(2);
          
          this.logger.log(
            `Scraping completado en ${duracionSegundos}s. Se encontraron ${zapatillasScraped.length} zapatillas`,
          );
          
          // Si no encontramos ninguna zapatilla pero aún tenemos intentos
          if (zapatillasScraped.length === 0 && intentosScraping < maxIntentosScraping) {
            this.logger.warn(`No se encontraron zapatillas en el intento ${intentosScraping}. Reintentando...`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos antes de reintentar
          }
        } catch (error) {
          errorScraping = error;
          this.logger.error(
            `Error en el intento ${intentosScraping} de scraping: ${error.message}`,
            error.stack,
          );
          
          if (intentosScraping < maxIntentosScraping) {
            this.logger.log(`Reintentando scraping en 10 segundos...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        }
      }
      
      // Si después de todos los intentos no tenemos zapatillas y hay un error, lanzarlo
      if (zapatillasScraped.length === 0 && errorScraping) {
        throw errorScraping;
      }

      // Diagnóstico de los datos obtenidos
      this.logger.log('='.repeat(80));
      this.logger.log(`DIAGNÓSTICO DE DATOS SCRAPEADOS:`);
      this.logger.log(`Total zapatillas encontradas: ${zapatillasScraped.length}`);
      
      // Verificación de datos
      const zapatillasValidas = zapatillasScraped.filter(z => z.marca && z.modelo && z.sku);
      this.logger.log(`Zapatillas con datos válidos (marca, modelo, sku): ${zapatillasValidas.length}`);
      
      // Verificación de tallas
      const zapatillasConTallas = zapatillasScraped.filter(z => z.tallas && z.tallas.length > 0);
      this.logger.log(`Zapatillas con tallas: ${zapatillasConTallas.length}`);
      
      // Contar tallas totales
      const totalTallas = zapatillasScraped.reduce((sum, z) => sum + (z.tallas?.length || 0), 0);
      this.logger.log(`Total tallas encontradas: ${totalTallas}`);
      this.logger.log(`Promedio de tallas por zapatilla: ${(totalTallas / zapatillasScraped.length).toFixed(2)}`);
      this.logger.log('='.repeat(80));

      zapatillasScraped.forEach(zapatilla => {
        zapatilla.tienda_id = tienda.id;
        
        // Asegurar que existe un array de tallas vacío si no hay
        if (!zapatilla.tallas) {
          zapatilla.tallas = [];
          this.logger.log(`Inicializando array de tallas vacío para ${zapatilla.marca} ${zapatilla.modelo}`);
        }
        
        // Verificar que todas las tallas encontradas tengan un valor definido para disponible (no forzar a true)
        zapatilla.tallas.forEach(t => {
          // Si disponible es undefined, asignarle un valor, pero NO forzar a true
          if (t.disponible === undefined) {
            // Dejar que el valor por defecto sea false (más conservador)
            t.disponible = false;
            this.logger.log(`Talla ${t.talla} no tiene definido disponible, estableciendo a false por defecto`);
          } else {
            this.logger.log(`Talla ${t.talla} tiene disponible=${t.disponible}`);
          }
        });
      });

      // Procesar los resultados utilizando la API
      this.logger.log(`Iniciando procesamiento de ${zapatillasScraped.length} zapatillas en la base de datos...`);
      const resultados = await this.procesarResultados(zapatillasScraped);

      // Análisis de resultados para el resumen final
      const zapatillasExitosas = resultados.filter(r => r.success).length;
      const zapatillasFallidas = resultados.filter(r => !r.success).length;
      
      this.logger.log('='.repeat(80));
      this.logger.log(`RESUMEN FINAL DEL PROCESO:`);
      this.logger.log(`Tienda: ${tienda.nombre} (ID: ${tienda.id})`);
      this.logger.log(`Zapatillas procesadas: ${zapatillasScraped.length}`);
      this.logger.log(`Zapatillas guardadas exitosamente: ${zapatillasExitosas}`);
      this.logger.log(`Zapatillas fallidas: ${zapatillasFallidas}`);
      this.logger.log('='.repeat(80));

      return {
        success: true,
        tienda: {
          id: tienda.id,
          nombre: tienda.nombre,
        },
        total: zapatillasScraped.length,
        resultados,
      };
    } catch (error) {
      this.logger.error(
        `Error fatal al ejecutar el scraper para tienda ${tiendaId}: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      // Importante: siempre limpiar el estado al finalizar
      this.runningScrapers.set(tiendaId, false);
      this.logger.log(`Proceso de scraping para tienda ${tiendaId} finalizado.`);
    }
  }

  /**
   * Procesa los resultados del scraping y los guarda a través de la API
   * OPTIMIZADO: Sistema de procesamiento en lotes, alta confiabilidad y manejo eficiente de recursos
   */
  private async procesarResultados(
    zapatillasScraped: ZapatillaScraped[],
  ): Promise<ResultadoZapatilla[]> {
    const resultados: ResultadoZapatilla[] = [];
    
    // Contadores para estadísticas
    let exitosos = 0;
    let fallidos = 0;
    let tallasExitosas = 0;
    let tallasFallidas = 0;

    this.logger.log('='.repeat(80));
    this.logger.log(`INICIANDO PROCESAMIENTO OPTIMIZADO DE ${zapatillasScraped.length} ZAPATILLAS`);
    this.logger.log('='.repeat(80));

    // Limpieza y normalización de datos
    const zapatillasValidas = zapatillasScraped
      .filter(z => z && z.marca && z.modelo && z.sku && z.tienda_id) // Filtrar solo datos completos
      .map(z => ({ // Normalizar datos
        ...z,
        marca: z.marca.trim(),
        modelo: z.modelo.trim(),
        sku: z.sku.trim(),
        // Asegurar que tallas siempre estén definidas y sean válidas
        tallas: (z.tallas || []).filter(t => t && t.talla)?.map(t => ({
          talla: t.talla.trim(),
          disponible: t.disponible === undefined ? false : Boolean(t.disponible)
        })) || []
      }));

    this.logger.log(`Datos validados: ${zapatillasValidas.length} de ${zapatillasScraped.length} zapatillas son válidas`);
      
    zapatillasValidas.forEach(z => {
      // Asegurar que existe un array de tallas vacío si no hay
      if (!z.tallas) {
        z.tallas = [];
        this.logger.log(`Inicializando array de tallas vacío para ${z.marca} ${z.modelo}`);
      }
      
      // Asegurar que todas las tallas tienen un valor para disponible (no forzar a true)
      z.tallas.forEach(t => {
        // Si disponible es undefined, establecerlo a false por defecto (más conservador)
        if (t.disponible === undefined) {
          t.disponible = false;
          this.logger.log(`Estableciendo disponible=false para talla ${t.talla} de ${z.marca} ${z.modelo} (valor no definido)`);
        }
      });
    });

    // NUEVO: Utilizar procesamiento en lotes de tamaño manejable para evitar sobrecarga
    const tamanioLote = 5; // Procesar en lotes de 5 zapatillas
    const totalLotes = Math.ceil(zapatillasValidas.length / tamanioLote);

    this.logger.log(`Estrategia: Procesando en ${totalLotes} lotes de hasta ${tamanioLote} zapatillas cada uno`);

    // Procesar por lotes para mejor control y estabilidad
    for (let lote = 0; lote < totalLotes; lote++) {
      const indiceInicio = lote * tamanioLote;
      const indiceFin = Math.min((lote + 1) * tamanioLote, zapatillasValidas.length);
      const zapatillasLote = zapatillasValidas.slice(indiceInicio, indiceFin);
      
      this.logger.log('='.repeat(60));
      this.logger.log(`PROCESANDO LOTE ${lote + 1}/${totalLotes}: ${zapatillasLote.length} zapatillas (${indiceInicio + 1}-${indiceFin})`);
      this.logger.log('='.repeat(60));

      // Procesar cada zapatilla del lote actual (ahora secuencial, no en paralelo)
      for (const [idx, zapatillaData] of zapatillasLote.entries()) {
        const indexGlobal = indiceInicio + idx + 1;
        
        // Log simplificado
        this.logger.log(`⚙️ [${indexGlobal}/${zapatillasValidas.length}] Procesando: ${zapatillaData.marca} ${zapatillaData.modelo}`);
        
        // Sistema de reintentos mejorado
        let intentos = 0;
        const maxIntentos = 3;
        let procesada = false;
        let resultado: any = null;
        
        while (intentos < maxIntentos && !procesada) {
          intentos++;
          try {
            // Usar procesamiento optimizado con timeout para evitar bloqueos
            resultado = await Promise.race([
              this.apiService.procesarZapatilla(zapatillaData),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout - Operación demasiado lenta')), 60000))
            ]);

            // Actualizar contadores
            tallasExitosas += resultado.tallasActualizadas || 0;
            tallasFallidas += resultado.tallasFallidas || 0;

            // Registrar éxito
            resultados.push({
              success: true,
              zapatilla: {
                marca: zapatillaData.marca,
                modelo: zapatillaData.modelo,
                sku: zapatillaData.sku,
                id: resultado.zapatilla.id,
              },
              tallas_procesadas: resultado.tallasActualizadas || 0,
            });
            
            procesada = true;
            exitosos++;
            this.logger.log(`✅ [${indexGlobal}/${zapatillasValidas.length}] Zapatilla guardada (ID: ${resultado.zapatilla.id}) con ${resultado.tallasActualizadas || 0} tallas`);

            // Pausa corta entre zapatillas
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`❌ [${indexGlobal}/${zapatillasValidas.length}] Error (${intentos}/${maxIntentos}): ${errorMsg}`);
            
            // Si es el último intento, registrar fallo
            if (intentos === maxIntentos) {
              fallidos++;
              resultados.push({
                success: false,
                zapatilla: {
                  marca: zapatillaData.marca,
                  modelo: zapatillaData.modelo,
                  sku: zapatillaData.sku,
                },
                error: errorMsg,
              });
            } else {
              // Esperar antes del siguiente intento (tiempo progresivo)
              const waitTime = 2000 * intentos; // 2s, 4s, 6s...
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
      }
      
      // Breve pausa entre lotes para optimizar recursos
      if (lote < totalLotes - 1) { // Si no es el último lote
        const pausaEntreLotes = 3000; // 3 segundos entre lotes
        this.logger.log(`Pausa de ${pausaEntreLotes/1000}s entre lotes para optimizar rendimiento...`);
        await new Promise(resolve => setTimeout(resolve, pausaEntreLotes));
      }
    }
    
    // Resumen final detallado
    this.logger.log('='.repeat(80));
    this.logger.log(`RESUMEN FINAL:`);
    this.logger.log(`Total zapatillas procesadas: ${zapatillasValidas.length}`);
    this.logger.log(`✅ Zapatillas guardadas exitosamente: ${exitosos} (${Math.round(exitosos/zapatillasValidas.length*100)}%)`);
    this.logger.log(`❌ Zapatillas fallidas: ${fallidos} (${Math.round(fallidos/zapatillasValidas.length*100)}%)`);
    this.logger.log(`✅ Tallas guardadas: ${tallasExitosas}`);
    this.logger.log(`❌ Tallas fallidas: ${tallasFallidas}`);
    this.logger.log(`Promedio de tallas por zapatilla: ${(tallasExitosas / (exitosos || 1)).toFixed(1)}`);
    this.logger.log('='.repeat(80));

    return resultados;
  }

  /**
   * Obtiene la lista de tiendas disponibles para scraping
   */
  async getTiendas(): Promise<TiendaInfo[]> {
    try {
      return await this.apiService.getTiendas();
    } catch (error) {
      this.logger.error(`Error al obtener tiendas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ejecuta el scraper para todas las tiendas
   * VERSIÓN MEJORADA: procesamiento más robusto y mejor manejo de errores
   */
  async runScraperForAllTiendas(options?: {
    maxItems?: number;
    headless?: boolean;
  }): Promise<ResultadoScraperAll> {
    // Comprobar explícitamente el estado de isGlobalRunning
    this.logger.log(`Comprobando estado global de scraping: ${this.isGlobalRunning ? 'En ejecución' : 'Inactivo'}`);
    
    if (this.isGlobalRunning) {
      throw new BadRequestException(
        'Ya hay un proceso de scraping global en ejecución',
      );
    }

    // Comprobar explícitamente el estado de los scrapers individuales
    let existenScrapersActivos = false;
    this.runningScrapers.forEach((value, key) => {
      if (value) {
        this.logger.log(`Scraper ID ${key} está marcado como activo`);
        existenScrapersActivos = true;
      }
    });
    
    if (existenScrapersActivos) {
      // Opción 1: Forzar reinicio del estado (más agresivo)
      this.logger.log('Forzando reinicio de estado de scrapers...');
      this.runningScrapers = new Map();
      this.logger.log('Estado de scrapers reiniciado');
      
      // Opción 2: Lanzar error (más conservador)
      // throw new BadRequestException(
      //  'Hay scrapers individuales activos. Espere a que terminen o reinicie el servicio.',
      // );
    }

    // Usar la variable de entorno si no se proporciona la opción maxItems
    if (!options) options = {};
    if (options.maxItems === undefined) {
      const envMaxItems = parseInt(this.configService.get('SCRAPER_MAX_ITEMS') || '50', 10);
      options.maxItems = isNaN(envMaxItems) ? 50 : envMaxItems;
    }

    try {
      this.isGlobalRunning = true;
      
      // Obtener tiendas activas con reintentos
      let tiendas: TiendaInfo[] = [];
      let intentosGetTiendas = 0;
      const maxIntentosGetTiendas = 3;
      
      while (intentosGetTiendas < maxIntentosGetTiendas && tiendas.length === 0) {
        intentosGetTiendas++;
        try {
          tiendas = await this.getTiendas();
          this.logger.log(`Obtenidas ${tiendas.length} tiendas activas (intento ${intentosGetTiendas})`);
        } catch (error) {
          this.logger.error(`Error al obtener tiendas (intento ${intentosGetTiendas}): ${error.message}`);
          if (intentosGetTiendas < maxIntentosGetTiendas) {
            this.logger.log(`Reintentando obtener tiendas en 5 segundos...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }
      
      const resultados: ResultadoTienda[] = [];

      if (tiendas.length === 0) {
        throw new Error('No hay tiendas activas disponibles para scraping');
      }

      this.logger.log('='.repeat(80));
      this.logger.log(`INICIANDO SCRAPING GLOBAL PARA ${tiendas.length} TIENDAS`);
      this.logger.log('='.repeat(80));
      
      // MODO INCREMENTAL: No limpiamos la base de datos completa para conservar datos históricos
      this.logger.log('MODO INCREMENTAL: Manteniendo datos históricos en la base de datos.');
      this.logger.log('Cada tienda limpiará sus propios datos antes de insertar los nuevos.');
      
      // Estadísticas globales
      let totalZapatillas = 0;
      let zapatillasGuardadas = 0;
      let tiendasExitosas = 0;
      let tiendasFallidas = 0;
      
      // Procesamos secuencialmente una tienda por vez
      for (const [index, tienda] of tiendas.entries()) {
        this.logger.log('='.repeat(80));
        this.logger.log(`PROCESANDO TIENDA ${index + 1}/${tiendas.length}: ${tienda.nombre} (ID: ${tienda.id})`);
        this.logger.log('='.repeat(80));
        
        try {
          // Verificar si esta tienda específica ya está en proceso
          if (this.runningScrapers.get(tienda.id)) {
            this.logger.warn(
              `Tienda ${tienda.nombre} ya está siendo procesada, saltando...`,
            );
            resultados.push({
              tienda: tienda.nombre,
              success: false,
              error: 'Tienda ya está siendo procesada por otro proceso',
            });
            tiendasFallidas++;
            continue;
          }

          // Ejecutar el scraper para esta tienda específica usando el método mejorado
          this.runningScrapers.set(tienda.id, true);
          
          // Usar el método runScraper para mayor consistencia
          const resultadoTienda = await this.runScraper({
            tiendaId: tienda.id,
            options: options
          });
          
          // Registrar resultados
          if (resultadoTienda.success) {
            const zapatillasExitosasTienda = resultadoTienda.resultados.filter(r => r.success).length;
            
            resultados.push({
              tienda: tienda.nombre,
              success: true,
              total: resultadoTienda.total,
              zapatillasGuardadas: zapatillasExitosasTienda
            });
            
            totalZapatillas += resultadoTienda.total;
            zapatillasGuardadas += zapatillasExitosasTienda;
            tiendasExitosas++;
            
            this.logger.log(`✅ Tienda ${tienda.nombre} procesada con éxito.`);
            this.logger.log(`   - Zapatillas encontradas: ${resultadoTienda.total}`);
            this.logger.log(`   - Zapatillas guardadas: ${zapatillasExitosasTienda}`);
          } else {
            resultados.push({
              tienda: tienda.nombre,
              success: false,
              error: 'Fallo en el procesamiento',
            });
            tiendasFallidas++;
            this.logger.error(`❌ Error al procesar tienda ${tienda.nombre}: Fallo en el procesamiento`);
          }

          // Breve pausa entre tiendas para no sobrecargar el sistema
          if (index < tiendas.length - 1) { // Si no es la última tienda
            const tiempoEspera = 10000; // 10 segundos
            this.logger.log(`Esperando ${tiempoEspera/1000} segundos antes de procesar la siguiente tienda...`);
            await new Promise(resolve => setTimeout(resolve, tiempoEspera));
          }
        } catch (error) {
          this.logger.error(
            `Error al procesar tienda ${tienda.nombre}: ${error.message}`,
          );

          resultados.push({
            tienda: tienda.nombre,
            success: false,
            error: error.message,
          });
          tiendasFallidas++;
        } finally {
          // Limpiar el estado de esta tienda
          this.runningScrapers.set(tienda.id, false);
        }
      }
      
      // Resumen final del proceso global
      this.logger.log('='.repeat(80));
      this.logger.log(`RESUMEN DEL SCRAPING GLOBAL:`);
      this.logger.log(`Total tiendas procesadas: ${tiendas.length}`);
      this.logger.log(`✅ Tiendas procesadas con éxito: ${tiendasExitosas}`);
      this.logger.log(`❌ Tiendas con errores: ${tiendasFallidas}`);
      this.logger.log(`Total zapatillas encontradas: ${totalZapatillas}`);
      this.logger.log(`Total zapatillas guardadas en base de datos: ${zapatillasGuardadas}`);
      this.logger.log('='.repeat(80));

      return {
        success: true,
        tiendas_procesadas: tiendas.length,
        resultados,
        zapatillas_totales: totalZapatillas,
        zapatillas_guardadas: zapatillasGuardadas
      };
    } catch (error) {
      this.logger.error(
        `Error fatal al ejecutar scraper para todas las tiendas: ${error.message}`,
        error.stack
      );
      throw error;
    } finally {
      // Importante: siempre limpiar el estado global al finalizar
      this.isGlobalRunning = false;
      this.logger.log('Proceso de scraping global finalizado.');
    }
  }

  /**
   * Verifica el estado del servicio de scraping con información detallada
   */
  getStatus(): {
    isRunning: boolean;
    runningScrapers: Record<number, boolean>;
    timestamp: string;
  } {
    const runningScrapersObj: Record<number, boolean> = {};

    // Convertir el Map a un objeto plano para la respuesta
    this.runningScrapers.forEach((value, key) => {
      // Incluir todos los scrapers para tener información completa
      runningScrapersObj[key] = value;
    });

    return {
      isRunning: this.isGlobalRunning,
      runningScrapers: runningScrapersObj,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Método actualizado para gestionar de manera más inteligente los datos existentes
   * En lugar de borrar todas las relaciones, sólo borramos las que llevan más de cierto tiempo sin actualizarse
   */
  private async limpiarDatosExistentes(tiendaId: number): Promise<void> {
    try {
      this.logger.log(`=== LIMPIEZA SELECTIVA DE DATOS EXISTENTES ===`);
      this.logger.log(`Iniciando análisis de datos para la tienda ID ${tiendaId}...`);

      // Obtener todas las zapatillas-tienda existentes para esta tienda con reintento
      let zapatillasTienda: any[] = [];
      let intentosGet = 0;
      const maxIntentosGet = 3;
      
      while (intentosGet < maxIntentosGet && zapatillasTienda.length === 0) {
        intentosGet++;
        try {
          zapatillasTienda = await this.apiService.makeAuthenticatedRequest(
            'get',
            `/zapatillas-tienda?tienda_id=${tiendaId}`,
          );
          
          this.logger.log(`Obtenidas ${zapatillasTienda.length} relaciones zapatilla-tienda (intento ${intentosGet})`);
        } catch (error) {
          this.logger.error(`Error al obtener zapatillas-tienda (intento ${intentosGet}): ${error.message}`);
          if (intentosGet < maxIntentosGet) {
            this.logger.log(`Reintentando obtener zapatillas-tienda en 2 segundos...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      if (zapatillasTienda && zapatillasTienda.length > 0) {
        this.logger.log(`Encontradas ${zapatillasTienda.length} relaciones zapatilla-tienda para analizar.`);
        
        // Estadisticas
        let tallasEliminadas = 0;
        let relacionesEliminadas = 0;
        let erroresTallas = 0;
        let erroresRelaciones = 0;
        let relacionesMantenidas = 0;
        
        // Agrupar relaciones zapatilla-tienda por zapatilla_id
        this.logger.log(`Agrupando relaciones por zapatilla_id para mantener sólo una por zapatilla...`);
        
        // Crear un mapa de zapatilla_id -> [lista de relaciones ordenadas por fecha]
        const mapaZapatillasRelaciones = new Map();
        
        for (const zt of zapatillasTienda) {
          const zapatillaId = zt.zapatilla_id;
          
          if (!mapaZapatillasRelaciones.has(zapatillaId)) {
            mapaZapatillasRelaciones.set(zapatillaId, []);
          }
          
          mapaZapatillasRelaciones.get(zapatillaId).push(zt);
        }
        
        // Para cada zapatilla, mantener sólo la relación más reciente y eliminar las demás
        for (const [zapatillaId, relaciones] of mapaZapatillasRelaciones.entries()) {
          this.logger.log(`Zapatilla ID=${zapatillaId}: ${relaciones.length} relaciones encontradas`);
          
          if (relaciones.length <= 1) {
            // Si sólo hay una relación, la mantenemos
            this.logger.log(`Zapatilla ID=${zapatillaId}: Solo tiene una relación, manteniendo.`);
            relacionesMantenidas++;
            continue;
          }
          
          // Ordenar relaciones por fecha de actualización (más reciente primero)
          // Asumiendo que hay un campo updated_at o similar
          relaciones.sort((a, b) => {
            const fechaA = a.updated_at ? new Date(a.updated_at) : new Date(0);
            const fechaB = b.updated_at ? new Date(b.updated_at) : new Date(0);
            return fechaB.getTime() - fechaA.getTime();
          });
          
          // Mantener la relación más reciente
          const relacionMantener = relaciones[0];
          this.logger.log(`Zapatilla ID=${zapatillaId}: Manteniendo relación ID=${relacionMantener.id}`);
          relacionesMantenidas++;
          
          // Eliminar las demás relaciones (desde la segunda en adelante)
          for (let i = 1; i < relaciones.length; i++) {
            const zt = relaciones[i];
            this.logger.log(`Eliminando relación redundante ID=${zt.id} para zapatilla ID=${zapatillaId}`);
            
            try {
              // Primero eliminar sus tallas
              let tallas: any[] = [];
              try {
                tallas = await this.apiService.makeAuthenticatedRequest(
                  'get',
                  `/tallas?zapatilla_tienda_id=${zt.id}`,
                );
                
                this.logger.log(`Encontradas ${tallas.length} tallas para eliminar de zapatilla-tienda ID=${zt.id}`);
              } catch (errorTallas) {
                this.logger.error(`Error al obtener tallas para zapatilla-tienda ID=${zt.id}: ${errorTallas.message}`);
              }
              
              if (tallas && tallas.length > 0) {
                // Eliminar tallas con reintentos individuales
                for (const talla of tallas) {
                  let eliminada = false;
                  let intentosDelete = 0;
                  const maxIntentosDelete = 2;
                  
                  while (!eliminada && intentosDelete < maxIntentosDelete) {
                    intentosDelete++;
                    try {
                      await this.apiService.makeAuthenticatedRequest(
                        'delete',
                        `/tallas/${talla.id}`,
                      );
                      eliminada = true;
                      tallasEliminadas++;
                    } catch (errorDeleteTalla) {
                      if (intentosDelete >= maxIntentosDelete) {
                        this.logger.error(`No se pudo eliminar la talla ID=${talla.id} después de ${maxIntentosDelete} intentos`);
                        erroresTallas++;
                      } else {
                        this.logger.warn(`Error al eliminar talla ID=${talla.id}, reintentando...`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                      }
                    }
                  }
                }
              }
              
              // Luego eliminar la relación
              await this.apiService.makeAuthenticatedRequest(
                'delete',
                `/zapatillas-tienda/${zt.id}`,
              );
              relacionesEliminadas++;
              this.logger.log(`Eliminada relación redundante ID=${zt.id}`);
            } catch (error) {
              this.logger.error(`Error al eliminar relación redundante ID=${zt.id}: ${error.message}`);
              erroresRelaciones++;
            }
          }
        }
        
        // Resumen final de la limpieza
        this.logger.log('=== RESUMEN DE LIMPIEZA SELECTIVA ===');
        this.logger.log(`Relaciones analizadas: ${zapatillasTienda.length}`);
        this.logger.log(`Relaciones únicas mantenidas: ${relacionesMantenidas}`);
        this.logger.log(`Relaciones redundantes eliminadas: ${relacionesEliminadas}`);
        this.logger.log(`Tallas eliminadas: ${tallasEliminadas}`);
        this.logger.log(`Errores en tallas: ${erroresTallas}`);
        this.logger.log(`Errores en relaciones: ${erroresRelaciones}`);
        this.logger.log('=================================');
      } else {
        this.logger.log(`No hay relaciones zapatilla-tienda existentes para la tienda ID ${tiendaId}.`);
      }
    } catch (error) {
      this.logger.error(`Error al limpiar datos existentes: ${error.message}`);
      // No interrumpimos el proceso si hay un error en la limpieza
    }
  }
}