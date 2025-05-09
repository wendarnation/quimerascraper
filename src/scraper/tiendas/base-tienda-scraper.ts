// // src/scraper/tiendas/base-tienda-scraper.ts
// import { Logger } from '@nestjs/common';
// import { Browser, BrowserContext, Page } from 'playwright';
// import {
//   ZapatillaScraped,
//   ScraperOptions,
//   TiendaInfo,
// } from '../interfaces/quimera-scraper.interface';
// import { chromium } from 'playwright';

// export abstract class BaseTiendaScraper {
//   protected readonly logger = new Logger(this.constructor.name);
//   protected browser: Browser;
//   protected context: BrowserContext;
//   protected page: Page;
//   protected options: ScraperOptions = {
//     headless: true,
//     maxItems: 50,
//   };

//   constructor(protected readonly tiendaInfo: TiendaInfo) {}

//   /**
//    * Método principal que debe implementar cada scraper específico
//    */
//   abstract scrapeZapatillas(): Promise<ZapatillaScraped[]>;

//   /**
//    * Método para normalizar marcas de zapatillas
//    */
//   protected normalizarMarca(marca: string): string {
//     marca = marca.trim().toLowerCase();

//     // Mapeo de variaciones de marcas comunes
//     const marcasMap = {
//       nike: 'Nike',
//       adidas: 'Adidas',
//       'new balance': 'New Balance',
//       nb: 'New Balance',
//       puma: 'Puma',
//       reebok: 'Reebok',
//       asics: 'Asics',
//       converse: 'Converse',
//       vans: 'Vans',
//       jordan: 'Jordan',
//       'under armour': 'Under Armour',
//       ua: 'Under Armour',
//       saucony: 'Saucony',
//       fila: 'Fila',
//       salomon: 'Salomon',
//     };

//     // Buscar coincidencias parciales
//     for (const [key, value] of Object.entries(marcasMap)) {
//       if (marca.includes(key)) {
//         return value;
//       }
//     }

//     // Si no hay coincidencia, capitalizar la primera letra
//     return marca.charAt(0).toUpperCase() + marca.slice(1);
//   }

//   /**
//    * Método para generar un SKU único para una zapatilla
//    */
//   protected generarSKU(marca: string, modelo: string): string {
//     // Eliminar caracteres especiales y espacios
//     const marcaLimpia = marca.replace(/[^\w]/g, '').toLowerCase();
//     const modeloLimpio = modelo.replace(/[^\w]/g, '').toLowerCase();

//     // Generar SKU: MARCA-MODELO-RANDOMID
//     const randomId = Math.floor(Math.random() * 10000)
//       .toString()
//       .padStart(4, '0');
//     return `${marcaLimpia}-${modeloLimpio}-${randomId}`;
//   }

//   /**
//    * Método para limpiar texto (eliminar espacios extra, saltos de línea, etc.)
//    */
//   protected limpiarTexto(texto: string): string {
//     return texto
//       .replace(/\s+/g, ' ') // Reemplazar espacios múltiples por uno solo
//       .replace(/^\s+|\s+$/g, '') // Eliminar espacios al inicio y final
//       .trim();
//   }

//   /**
//    * Método para extraer precio de un texto
//    */
//   protected extraerPrecio(texto: string): number {
//     // Buscar patrón de precio: números con punto o coma decimal
//     const match = texto.match(/(\d+[,.]\d+)/);
//     if (match) {
//       // Convertir a número (reemplazando coma por punto si es necesario)
//       return parseFloat(match[0].replace(',', '.'));
//     }
//     return 0;
//   }

//   /**
//    * Inicializa el navegador de Playwright
//    */
//   async initBrowser(): Promise<void> {
//     if (this.options?.browser) {
//       this.browser = this.options.browser;
//     } else {
//       this.browser = await chromium.launch({
//         headless: this.options?.headless !== false,
//       });
//     }

//     this.context = await this.browser.newContext({
//       userAgent:
//         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
//       viewport: { width: 1920, height: 1080 },
//       // Configuraciones para simular un navegador real
//       deviceScaleFactor: 1,
//       isMobile: false,
//       hasTouch: false,
//       locale: 'es-ES',
//       javaScriptEnabled: true,
//       bypassCSP: true,
//       permissions: ['geolocation'],
//       // Fingir comportamiento humano
//       geolocation: { latitude: 40.416775, longitude: -3.70379 }, // Madrid
//       colorScheme: 'light',
//       reducedMotion: 'no-preference',
//       forcedColors: 'none',
//     });

//     this.page = await this.context.newPage();

//     // Configurar timeouts
//     this.page.setDefaultTimeout(30000); // 30 segundos para todas las operaciones
//     this.page.setDefaultNavigationTimeout(60000); // 60 segundos para navegación
//   }

//   /**
//    * Cierra el navegador de Playwright
//    */
//   async closeBrowser(): Promise<void> {
//     if (this.browser && !this.options?.browser) {
//       await this.browser.close();
//     }
//   }

//   /**
//    * Configura las opciones del scraper
//    */
//   setOptions(options: ScraperOptions): void {
//     this.options = { ...this.options, ...options };
//   }

//   /**
//    * Añade un retraso aleatorio para evitar detección
//    */
//   protected async esperaAleatoria(
//     minMs: number = 500,
//     maxMs: number = 3000,
//   ): Promise<void> {
//     const tiempoEspera =
//       Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
//     await this.page.waitForTimeout(tiempoEspera);
//   }
// }

// src/scraper/tiendas/base-tienda-scraper.ts
import { Logger } from '@nestjs/common';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import {
  ZapatillaScraped,
  ScraperOptions,
  TiendaInfo,
} from '../interfaces/quimera-scraper.interface';

export abstract class BaseTiendaScraper {
  protected readonly logger = new Logger(this.constructor.name);
  protected browser: Browser;
  protected context: BrowserContext;
  protected page: Page;
  protected options: ScraperOptions = {
    headless: true,
    maxItems: 10,
    proxyUrl: null,
    stealth: true,
  };

  constructor(protected readonly tiendaInfo: TiendaInfo) {}

  /**
   * Método principal que debe implementar cada scraper específico
   */
  abstract scrapeZapatillas(): Promise<ZapatillaScraped[]>;

  /**
   * Método para normalizar marcas de zapatillas
   */
  protected normalizarMarca(marca: string): string {
    marca = marca.trim().toLowerCase();

    // Mapeo de variaciones de marcas comunes
    const marcasMap = {
      nike: 'Nike',
      adidas: 'Adidas',
      'new balance': 'New Balance',
      nb: 'New Balance',
      puma: 'Puma',
      reebok: 'Reebok',
      asics: 'Asics',
      converse: 'Converse',
      vans: 'Vans',
      jordan: 'Jordan',
      'under armour': 'Under Armour',
      ua: 'Under Armour',
      saucony: 'Saucony',
      fila: 'Fila',
      salomon: 'Salomon',
    };

    // Buscar coincidencias parciales
    for (const [key, value] of Object.entries(marcasMap)) {
      if (marca.includes(key)) {
        return value;
      }
    }

    // Si no hay coincidencia, capitalizar la primera letra
    return marca.charAt(0).toUpperCase() + marca.slice(1);
  }

  /**
   * Método para generar un SKU para una zapatilla
   * Optimizado para generar SKUs totalmente deterministas
   * El mismo par de marca/modelo siempre generará el mismo SKU exacto
   */
  protected generarSKU(marca: string, modelo: string): string {
    if (!marca || !modelo) {
      this.logger.warn(`Intentando generar SKU con datos incompletos: marca="${marca}", modelo="${modelo}"`);
      // Usar valores por defecto para evitar errores
      marca = marca || 'unknown';
      modelo = modelo || 'model';
    }
    
    // Normalizar marca y modelo para máxima consistencia:
    // 1. Convertir a minúsculas
    // 2. Eliminar caracteres especiales, espacios y acentos
    // 3. Limitar longitud para evitar SKUs demasiado largos
    const marcaLimpia = marca.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
      .replace(/[^a-z0-9]/g, '') // Solo permitir letras y números
      .substring(0, 15);
    
    // Para el modelo, eliminar menciones de la marca si están presentes para evitar redundancia
    let modeloTemp = modelo.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Eliminar acentos
    
    // Eliminar la marca del modelo si aparece al principio
    if (modeloTemp.startsWith(marca.toLowerCase())) {
      modeloTemp = modeloTemp.substring(marca.toLowerCase().length).trim();
    } else if (modeloTemp.includes(marca.toLowerCase())) {
      modeloTemp = modeloTemp.replace(marca.toLowerCase(), '').trim();
    }
    
    const modeloLimpio = modeloTemp
      .replace(/[^a-z0-9]/g, '') // Solo permitir letras y números
      .substring(0, 25);
    
    // Usar un algoritmo de hash más simple y determinista
    // para evitar variaciones en diferentes plataformas
    let hash = 0;
    const str = `${marcaLimpia}-${modeloLimpio}`; // Formato consistente para el hash
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convertir a entero de 32 bits
    }
    
    // Asegurar que el hash siempre sea positivo y tenga 8 dígitos
    const hashStr = (Math.abs(hash) % 100000000).toString().padStart(8, '0');
    
    // Generar SKU: MARCA-MODELO-HASH
    // Este formato garantiza que zapatillas idénticas tengan el mismo SKU
    return `${marcaLimpia}-${modeloLimpio}-${hashStr}`;
  }

  /**
   * Método para limpiar texto (eliminar espacios extra, saltos de línea, etc.)
   */
  protected limpiarTexto(texto: string): string {
    if (!texto) return '';

    return texto
      .replace(/\s+/g, ' ') // Reemplazar espacios múltiples por uno solo
      .replace(/^\s+|\s+$/g, '') // Eliminar espacios al inicio y final
      .trim();
  }

  /**
   * Método para extraer precio de un texto
   */
  protected extraerPrecio(texto: string): number {
    if (!texto) return 0;

    // Buscar patrón de precio: números con punto o coma decimal
    const match = texto.match(/(\d+[,.]\d+)/);
    if (match) {
      // Convertir a número (reemplazando coma por punto si es necesario)
      return parseFloat(match[0].replace(',', '.'));
    }
    return 0;
  }

  /**
   * Inicializa el navegador de Playwright con opciones mejoradas para anti-detección
   */
  async initBrowser(customUserAgent?: string): Promise<void> {
    try {
      if (this.options?.browser) {
        this.browser = this.options.browser;
      } else {
        // Opciones avanzadas para el lanzamiento del navegador
        const launchOptions: any = {
          headless: this.options?.headless !== false,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials',
            '--disable-web-security',
            '--disable-infobars',
            '--window-size=1920,1080',
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
          ],
          // Si se ha proporcionado un proxy, configurarlo
          ...(this.options?.proxyUrl
            ? { proxy: { server: this.options.proxyUrl } }
            : {}),
        };

        this.browser = await chromium.launch(launchOptions);
      }

      // Crear contexto con configuraciones anti-fingerprinting
      const contextOptions: any = {
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        locale: 'es-ES',
        javaScriptEnabled: true,
        bypassCSP: true,
        permissions: ['geolocation'],
        geolocation: { latitude: 40.416775, longitude: -3.70379 }, // Madrid
        colorScheme: 'light',
        reducedMotion: 'no-preference',
        forcedColors: 'none',
        acceptDownloads: true,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          'sec-ch-ua':
            '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
        },
      };

      // Utilizar un User-Agent personalizado si se proporciona
      if (customUserAgent) {
        contextOptions.userAgent = customUserAgent;
      } else {
        // Usar un User-Agent predefinido común de navegador real
        contextOptions.userAgent =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';
      }

      this.context = await this.browser.newContext(contextOptions);

      // Usar plugin de evasión para desactivar la detección de navegador automatizado
      if (this.options?.stealth) {
        await this.setupStealthMode();
      }

      // Crear una nueva página
      this.page = await this.context.newPage();

      // Configurar timeouts para operaciones de navegación
      this.page.setDefaultTimeout(60000); // 60 segundos para todas las operaciones
      this.page.setDefaultNavigationTimeout(90000); // 90 segundos para navegación

      // Añadir monitoreo de errores de red
      this.page.on('requestfailed', (request) => {
        const url = request.url();
        const resourceType = request.resourceType();
        const failure = request.failure();

        // Sólo registrar errores importantes (no recursos secundarios como analytics)
        if (
          !url.includes('analytics') &&
          !url.includes('tracking') &&
          !url.includes('ga.js') &&
          !url.includes('tag') &&
          (resourceType === 'document' ||
            resourceType === 'script' ||
            resourceType === 'xhr' ||
            resourceType === 'fetch')
        ) {
          this.logger.warn(
            `Solicitud fallida: ${url} - ${resourceType} - ${failure?.errorText}`,
          );
        }
      });

      // Interceptar respuestas con código 403 o 429 (posible detección de bot)
      this.page.on('response', (response) => {
        const status = response.status();
        if (status === 403 || status === 429) {
          this.logger.warn(
            `⚠️ Posible detección de bot: ${response.url()} - ${status}`,
          );
        }
      });
    } catch (error) {
      this.logger.error(`Error al inicializar el navegador: ${error.message}`);
      throw error;
    }
  }

  /**
   * Configura técnicas de modo sigilo para evitar la detección del scraper
   */
  private async setupStealthMode(): Promise<void> {
    await this.context.addInitScript(() => {
      // Ocultar el objeto navigator.webdriver (usado para detectar automatización)
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Modificar el user-agent para eliminar indicadores de headless
      const userAgent = navigator.userAgent;
      if (userAgent.includes('HeadlessChrome')) {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => userAgent.replace('HeadlessChrome', 'Chrome'),
        });
      }

      // Añadir plugins para parecer un navegador real
      if (navigator.plugins.length === 0) {
        Object.defineProperty(navigator, 'plugins', {
          get: () =>
            [1, 2, 3, 4, 5].map(() => ({
              description: 'Example Plugin',
              filename: 'plugin.dll',
              length: 1,
              name: 'Example Plugin Name',
              version: '1.0.0',
            })),
        });
      }

      // Simular valores de lenguajes
      if (!navigator.languages || navigator.languages.length === 0) {
        Object.defineProperty(navigator, 'languages', {
          get: () => ['es-ES', 'es', 'en-US', 'en'],
        });
      }

      // Modificar canvas fingerprinting
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (type) {
        if (type === 'image/png' && this.width === 16 && this.height === 16) {
          // Probable fingerprinting de FingerprintJS, devolver algo diferente cada vez
          return (
            'data:image/png;base64,' + Math.random().toString(36).substring(7)
          );
        }
        return originalToDataURL.apply(this, arguments);
      };

      // Modificar getImageData para canvas fingerprinting
      if (CanvasRenderingContext2D.prototype.getImageData) {
        const originalGetImageData =
          CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function (
          x,
          y,
          w,
          h,
        ) {
          const imageData = originalGetImageData.call(this, x, y, w, h);

          // Pequeñas modificaciones aleatorias a los datos para evitar fingerprinting constante
          if (imageData && imageData.data && imageData.data.length > 40) {
            for (let i = 0; i < imageData.data.length; i += 50) {
              if (Math.random() > 0.5) {
                imageData.data[i] = (imageData.data[i] + 1) % 256;
              }
            }
          }

          return imageData;
        };
      }

      // Variables para WebGL fingerprinting (añadido de forma segura para TypeScript)
      if (typeof WebGLRenderingContext !== 'undefined') {
        const WebGLProto = WebGLRenderingContext.prototype;
        if (WebGLProto && WebGLProto.getParameter) {
          const getParameterOrig = WebGLProto.getParameter;
          WebGLProto.getParameter = function (parameter) {
            // UNMASKED_VENDOR_WEBGL and UNMASKED_RENDERER_WEBGL constants
            if (parameter === 37445) {
              return 'Intel Inc.';
            }
            if (parameter === 37446) {
              return 'Intel Iris Graphics 6100';
            }
            return getParameterOrig.apply(this, arguments);
          };
        }
      }
    });
  }

  /**
   * Cierra el navegador de Playwright
   */
  async closeBrowser(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close().catch(() => {});
      }

      if (this.browser && !this.options?.browser) {
        await this.browser.close().catch(() => {});
      }
    } catch (error) {
      this.logger.error(`Error al cerrar el navegador: ${error.message}`);
    }
  }

  /**
   * Configura las opciones del scraper
   */
  setOptions(options: ScraperOptions): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Añade un retraso aleatorio para evitar detección
   * Con una distribución de tiempo más humana
   */
  protected async esperaAleatoria(
    minMs: number = 500,
    maxMs: number = 3000,
  ): Promise<void> {
    // Usar una distribución normal/gaussiana para tiempos más humanos
    // La mayoría de las pausas estarán cerca del centro del rango
    const media = (minMs + maxMs) / 2;
    const desviacion = (maxMs - minMs) / 4;

    // Generar un valor usando distribución normal
    let tiempoEspera: number;
    do {
      // Aproximación Box-Muller para distribución normal
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

      tiempoEspera = Math.round(media + desviacion * z0);
    } while (tiempoEspera < minMs || tiempoEspera > maxMs);

    await this.page.waitForTimeout(tiempoEspera);
  }

  /**
   * Método mejorado para manejar errores de navegación con reintentos
   */
  protected async navegarConReintentos(
    url: string,
    maxIntentos: number = 3,
  ): Promise<boolean> {
    let intento = 0;
    let exito = false;

    while (intento < maxIntentos && !exito) {
      intento++;
      try {
        this.logger.log(
          `Navegando a ${url} (intento ${intento}/${maxIntentos})`,
        );

        const response = await this.page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 60000,
        });

        if (!response) {
          throw new Error('No se recibió respuesta del servidor');
        }

        const status = response.status();
        if (status >= 200 && status < 400) {
          exito = true;
          this.logger.log(`Navegación exitosa a ${url}`);
        } else if (status === 403 || status === 429) {
          this.logger.warn(`Posible detección de bot (${status}) en ${url}`);

          // Esperar más tiempo entre reintentos si se detecta bloqueo
          await this.esperaAleatoria(10000, 20000);

          // Si es el último intento, intentar con otro User-Agent
          if (intento === maxIntentos - 1) {
            const userAgents = [
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0',
            ];
            const randomUA =
              userAgents[Math.floor(Math.random() * userAgents.length)];

            await this.page.setExtraHTTPHeaders({
              'User-Agent': randomUA,
            });

            this.logger.log(
              `Cambiando User-Agent para último intento: ${randomUA}`,
            );
          }
        } else {
          this.logger.warn(`Respuesta HTTP inesperada (${status}) en ${url}`);
          await this.esperaAleatoria(3000, 7000);
        }
      } catch (error) {
        this.logger.error(
          `Error en intento ${intento}: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Esperar antes del siguiente intento
        await this.esperaAleatoria(5000, 10000);
      }
    }

    return exito;
  }

  /**
   * Extrae información de un elemento usando múltiples estrategias
   */
  protected async extraerTextoElemento(selectores: string[]): Promise<string> {
    for (const selector of selectores) {
      try {
        const elemento = await this.page.$(selector);
        if (elemento) {
          const texto = await elemento.textContent();
          if (texto && texto.trim()) {
            return texto.trim();
          }
        }
      } catch (error) {
        // Continuar con el siguiente selector
      }
    }
    return '';
  }

  /**
   * Método para capturar screenshots en caso de errores
   */
  protected async capturarScreenshot(nombre: string): Promise<string> {
    try {
      const fecha = new Date().toISOString().replace(/[:.]/g, '-');
      const rutaArchivo = `./logs/screenshot_${nombre}_${fecha}.png`;
      await this.page.screenshot({ path: rutaArchivo, fullPage: true });
      this.logger.log(`Screenshot guardado en ${rutaArchivo}`);
      return rutaArchivo;
    } catch (error) {
      this.logger.error(
        `Error al capturar screenshot: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }
}
