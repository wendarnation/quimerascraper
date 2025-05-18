// src/scraper/tiendas/footdistrict-scraper.ts
import { Injectable } from '@nestjs/common';
import { BaseTiendaScraper } from './base-tienda-scraper';
import {
  ZapatillaScraped,
  TiendaInfo,
  TallaScraped,
} from '../interfaces/quimera-scraper.interface';

@Injectable()
export class FootdistrictScraper extends BaseTiendaScraper {
  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ];

  constructor(tiendaInfo: TiendaInfo) {
    super(tiendaInfo);
  }

  /**
   * Obtiene un User-Agent aleatorio de la lista
   */
  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * Método principal para raspar zapatillas de Footdistrict
   */
  async scrapeZapatillas(): Promise<ZapatillaScraped[]> {
    try {
      await this.initBrowser(this.getRandomUserAgent());

      // URL de la categoría zapatillas en Footdistrict (basado en la captura de pantalla)
      const url = 'https://footdistrict.com/zapatillas/';
      this.logger.log(`Navegando a ${url}`);

      // Configurar evasion de fingerprinting
      await this.setupBrowserEvasion();

      // Configuración previa a la navegación - Mejorar evasión de detección
      await this.page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="8"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'Referer': 'https://www.google.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      });
      
      // Configurar localStorage y cookies para parecer una sesión normal
      await this.page.addScriptTag({
        content: `
          // Agregar historial de navegación simulado
          Object.defineProperty(window, 'history', {
            get: function() {
              return { length: 5, scrollRestoration: 'auto', state: null };
            }
          });
          
          // Simular visitante previo
          localStorage.setItem('_ga', 'GA1.2.123456789.1620000000');
          localStorage.setItem('_gid', 'GA1.2.987654321.1620000000');
          localStorage.setItem('visited_before', 'true');
        `
      });

      // Navegar a la URL con opciones avanzadas de espera
      const response = await this.page.goto(url, {
        waitUntil: 'domcontentloaded', // Cambiar a domcontentloaded en lugar de networkidle
        timeout: 60000,
      });
      
      // Pausa breve para permitir que se cargue la página
      await this.esperaAleatoria(2000, 5000);

      if (!response || response.status() >= 400) {
        throw new Error(
          `Error de navegación: ${response?.status()} - ${response?.statusText()}`,
        );
      }

      // Gestionar cookies si es necesario
      await this.handleCookieConsent();

      // Simular desplazamiento humano en la página
      await this.simulateHumanScrolling();

      // Intentar con diferentes selectores para la lista de productos
      // Los sitios web suelen tener diferentes versiones (escritorio, móvil, pruebas A/B)
      const productListSelectors = [
        'ol.products.list.items.product-items', // Selector original de las capturas
        'ol.products.list', // Alternativa más simple
        '.products-grid', // Otra alternativa común
        '.product-items', // Alternativa más genérica
        '.products', // Muy genérico
        'div[class*="products"]', // Extremadamente genérico
        'main', // Último recurso - contenedor principal
      ];
      
      let selectorFound = false;
      let productListSelector = 'body'; // Selector por defecto si nada funciona
      
      // Probar cada selector con un timeout más corto
      for (const selector of productListSelectors) {
        try {
          this.logger.log(`Intentando con selector: ${selector}`);
          await this.page.waitForSelector(selector, { timeout: 5000 });
          this.logger.log(`Selector encontrado: ${selector}`);
          selectorFound = true;
          productListSelector = selector;
          
          // Si detectamos que estamos siendo bloqueados, intentar bypassear
          const isBlocked = await this.page.evaluate(() => {
            return document.body.innerText.toLowerCase().includes('access denied') ||
                   document.body.innerText.toLowerCase().includes('forbidden') ||
                   document.title.toLowerCase().includes('403');
          });
          
          if (isBlocked) {
            this.logger.warn('Detección de bloqueo durante la búsqueda de productos');
            // Intentar evadir el bloqueo
            const bypassSuccess = await this.tryToBypassBlock();
            if (!bypassSuccess) {
              throw new Error('No se pudo evadir el bloqueo');
            }
            // Esperar un momento y reintentar
            await this.esperaAleatoria(3000, 5000);
            await this.page.waitForSelector(selector, { timeout: 10000 });
          }
          
          break; // Salir del bucle si encontramos un selector que funciona
        } catch (error) {
          // Continuar con el siguiente selector
          this.logger.debug(`Selector ${selector} no encontrado, probando siguiente...`);
        }
      }
      
      // Si ninguno de los selectores funcionó, intentar capturar un screenshot y verificar bloqueo
      if (!selectorFound) {
        // Capturar un screenshot para depuración
        try {
          await this.page.screenshot({ path: `footdistrict_error_${Date.now()}.png` });
          this.logger.warn('Captura de pantalla guardada para depuración');
        } catch (screenshotError) {
          this.logger.warn(`Error al guardar captura: ${screenshotError.message}`);
        }
        
        // Verificar si estamos ante un CAPTCHA o bloqueo
        const isCaptcha = await this.checkForCaptcha();
        if (isCaptcha) {
          throw new Error('Se ha detectado un CAPTCHA o bloqueo en la página');
        }
        
        this.logger.warn(`Usando selector de último recurso: ${productListSelector}`);
      }

      // Extraer URLs de los productos
      const productUrls = await this.extractProductUrls(productListSelector);
      this.logger.log(`Se encontraron ${productUrls.length} productos`);

      // Limitar la cantidad de productos a procesar
      const limitedUrls = this.options?.maxItems
        ? productUrls.slice(0, this.options.maxItems)
        : productUrls;

      // Array para almacenar los resultados
      const zapatillas: ZapatillaScraped[] = [];

      // Procesar cada URL de producto con reintentos
      for (const [index, url] of limitedUrls.entries()) {
        try {
          this.logger.log(
            `Procesando producto ${index + 1}/${limitedUrls.length}: ${url}`,
          );

          // Sistema de reintentos para productos individuales
          let retries = 0;
          const maxRetries = 3;
          let success = false;
          let zapatilla: ZapatillaScraped | null = null;

          while (!success && retries < maxRetries) {
            try {
              zapatilla = await this.scrapeZapatillaDetail(url);
              success = true;
              if (zapatilla) {
                zapatillas.push(zapatilla);
              }
            } catch (error) {
              retries++;
              this.logger.warn(
                `Intento ${retries}/${maxRetries} fallido para ${url}: ${error instanceof Error ? error.message : String(error)}`,
              );

              if (retries >= maxRetries) {
                throw new Error(
                  `Máximo número de reintentos alcanzado para ${url}`,
                );
              }

              // Esperar más tiempo entre reintentos
              await this.esperaAleatoria(5000, 10000);

              // Cambiar User-Agent entre reintentos
              await this.page.setExtraHTTPHeaders({
                'User-Agent': this.getRandomUserAgent(),
              });
            }
          }

          // Esperar un tiempo aleatorio entre peticiones
          await this.esperaAleatoria(3000, 7000);

          // Cada cierto número de productos, cambiar fingerprint
          if (index > 0 && index % 5 === 0) {
            await this.rotateFingerprint();
          }
        } catch (error) {
          this.logger.error(
            `Error al procesar ${url}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `Scraping completado. Se procesaron ${zapatillas.length} productos`,
      );
      return zapatillas;
    } catch (error) {
      this.logger.error(
        `Error en scrapeZapatillas: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * Configura técnicas de evasión de fingerprinting del navegador
   */
  private async setupBrowserEvasion(): Promise<void> {
    // Ocultar webdriver mediante un script de página
    await this.page.addScriptTag({
      content: `
      // Ocultar webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Simular plugin de Chrome y extensiones - mayor similitud a navegador real
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: {
              type: 'application/x-google-chrome-pdf',
              suffixes: 'pdf',
              description: 'Portable Document Format',
              enabledPlugin: Plugin,
            },
            description: 'Chrome PDF Plugin',
            filename: 'internal-pdf-viewer',
            length: 1,
            name: 'Chrome PDF Plugin',
          },
          {
            0: {
              type: 'application/pdf',
              suffixes: 'pdf',
              description: 'Portable Document Format',
              enabledPlugin: Plugin,
            },
            description: 'Chrome PDF Viewer',
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            length: 1,
            name: 'Chrome PDF Viewer',
          },
          {
            0: {
              type: 'application/x-nacl',
              suffixes: '',
              description: 'Native Client Executable',
              enabledPlugin: Plugin,
            },
            description: 'Native Client',
            filename: 'internal-nacl-plugin',
            length: 1,
            name: 'Native Client',
          },
        ],
      });
      
      // Simular chrome extension
      if (!window.chrome) window.chrome = {};
      window.chrome.runtime = {};

      // Modificar el user-agent en el objeto navigator
      const userAgent = window.navigator.userAgent;
      // Evitar presencia de "HeadlessChrome"
      if (userAgent.includes('HeadlessChrome')) {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => userAgent.replace('HeadlessChrome', 'Chrome'),
        });
      }

      // Fingerprinting canvas
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

          // Perturbación más sutil en los datos para evitar detección de fingerprinting
          if (Math.random() > 0.9) { // Solo modificar ocasionalmente
            for (let i = 0; i < imageData.data.length; i += 150) {
              if (imageData.data[i] % 2 === 0) {
                imageData.data[i] += 1;
              }
            }
          }

          return imageData;
        };
      }
      
      // Override WebGL para evitar fingerprinting
      if (WebGLRenderingContext && WebGLRenderingContext.prototype) {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          // Modificar RENDERER y VENDOR para evitar detección
          if (parameter === 37446) { // RENDERER
            return 'Intel Iris OpenGL Engine';
          }
          if (parameter === 37445) { // VENDOR
            return 'Intel Inc.';
          }
          return getParameter.apply(this, arguments);
        };
      }
      `
    });
    
    // Simular actividad de mouse que parece humana antes de navegacion
    await this.simulateInitialMouseMovement();
  }
  
  /**
   * Simula movimientos iniciales del ratón para aparecer más humano
   */
  private async simulateInitialMouseMovement(): Promise<void> {
    try {
      const width = 1366;
      const height = 768;
      
      // Mover desde el centro hacia un lado
      await this.page.mouse.move(width / 2, height / 2);
      await this.esperaAleatoria(100, 200);
      
      // Movimientos suaves en patrón irregular
      for (let i = 0; i < 3; i++) {
        const targetX = Math.floor(Math.random() * width);
        const targetY = Math.floor(Math.random() * (height / 2));
        
        // División en pasos para movimiento más suave
        const steps = 5 + Math.floor(Math.random() * 5);
        const currentX = await this.page.evaluate(() => window.innerWidth / 2);
        const currentY = await this.page.evaluate(() => window.innerHeight / 2);
        
        for (let step = 1; step <= steps; step++) {
          const x = currentX + (targetX - currentX) * (step / steps);
          const y = currentY + (targetY - currentY) * (step / steps);
          await this.page.mouse.move(x, y);
          await this.esperaAleatoria(10, 30);
        }
        
        await this.esperaAleatoria(200, 400);
      }
    } catch (error) {
      // Ignorar errores en la simulación de ratón
      this.logger.debug('Error al simular movimiento inicial del ratón', error);
    }
  }

  /**
   * Gestionar el banner de consentimiento de cookies
   */
  private async handleCookieConsent(): Promise<void> {
    try {
      // Selectores comunes para botones de aceptar cookies
      const cookieSelectors = [
        'button:has-text("Aceptar")',
        'button:has-text("Aceptar todas")',
        'button:has-text("Aceptar cookies")',
        '#accept-cookies',
        '.cookie-accept-button',
        '.cookie-banner .accept',
        '.cookie-consent button.accept',
        'button[data-testid="cookie-accept"]',
        '.cky-consent-container button.cky-btn-accept',
      ];

      for (const selector of cookieSelectors) {
        const cookieButton = await this.page.$(selector);
        if (cookieButton) {
          await cookieButton.click();
          this.logger.log(
            `Banner de cookies cerrado con selector: ${selector}`,
          );
          await this.esperaAleatoria(1000, 2000);
          break;
        }
      }
    } catch (error) {
      this.logger.log('No se encontró banner de cookies o no se pudo cerrar');
    }
  }

  /**
   * Simula scroll humano en la página
   */
  private async simulateHumanScrolling(): Promise<void> {
    // Obtener altura de la página
    const pageHeight = await this.page.evaluate(
      () => document.body.scrollHeight,
    );

    // Realizar scroll en pequeños incrementos para simular comportamiento humano
    let currentPosition = 0;
    const viewportHeight = await this.page.evaluate(() => window.innerHeight);

    while (currentPosition < pageHeight) {
      // Scroll incremental
      const scrollAmount = Math.floor(Math.random() * 200) + 300; // entre 300 y 500px
      currentPosition += scrollAmount;

      await this.page.evaluate((position) => {
        window.scrollTo({
          top: position,
          behavior: 'smooth',
        });
      }, currentPosition);

      // Pausa breve para simular lectura de contenido
      await this.esperaAleatoria(500, 1200);

      // Ocasionalmente, mover el ratón a un elemento aleatorio
      if (Math.random() > 0.7) {
        const randomElements = await this.page.$$('a, button, img');
        if (randomElements.length > 0) {
          const randomElement =
            randomElements[Math.floor(Math.random() * randomElements.length)];
          await randomElement.hover({ force: true }).catch(() => {}); // Ignorar errores
        }
      }
    }

    // Volver a una posición aleatoria en la página
    await this.page.evaluate(() => {
      window.scrollTo({
        top: Math.floor(Math.random() * (document.body.scrollHeight * 0.6)),
        behavior: 'smooth',
      });
    });

    await this.esperaAleatoria(1000, 2000);
  }

  /**
   * Extrae URLs de productos de la página de listado
   */
  private async extractProductUrls(selector: string): Promise<string[]> {
    await this.esperaAleatoria(2000, 3000);

    // Footdistrict puede utilizar diferentes selectores dependiendo de la versión móvil o escritorio
    // Verificar múltiples selectores posibles para la lista de productos
    const productUrls = await this.page.evaluate((selector) => {
    // Función para obtener las URLs de productos con selectores alternativos
    const getProductUrls = () => {
    // Intentar todos los selectores posibles basados en variaciones del sitio
    const possibleSelectors = [
      // Selector original
            `${selector} li.product-item a.product-item-photo`,
      // Selectores alternativos
      'ol.products.list li.item.product a.product-item-link',
    'ol.products.list li.item.product a.product-image',
    'div.product-items li.product-item a.product-image',
    'div.products-grid li.item a.product-image',
    'div.products div.product a',
    // Selector muy genérico como último recurso
    'a[href*="/zapatillas/"]'
    ];
    
    for (const currentSelector of possibleSelectors) {
    const elements = document.querySelectorAll(currentSelector);
      if (elements && elements.length > 0) {
              console.log(`Encontrado selector funcionando: ${currentSelector}, ${elements.length} elementos`);
        return Array.from(elements)
            .filter(element => {
                  return element instanceof HTMLAnchorElement && 
                     element.href && 
                       element.href.includes('footdistrict.com');
                })
                .map(element => (element as HTMLAnchorElement).href);
            }
          }
          
          // Si todavía no encontramos nada, buscar todos los enlaces en la página
          // que contengan '/zapatillas/' o relacionados con productos
          console.log('No se encontraron productos con selectores específicos, buscando enlaces genéricos...');
          return Array.from(document.querySelectorAll('a[href]'))
            .filter(element => {
              const href = (element as HTMLAnchorElement).href.toLowerCase();
              return href.includes('/zapatillas/') || 
                     href.includes('/calzado/') || 
                     href.includes('/product/') || 
                     (href.includes('footdistrict.com') && href.match(/\d+\.html$/));
            })
            .map(element => (element as HTMLAnchorElement).href);
        };

        return getProductUrls();
      }, selector);

    // Eliminar duplicados y URLs vacías
    return [...new Set(productUrls)].filter((url) => url && url.length > 0);
  }

  /**
   * Cambia la huella digital del navegador rotando UA, viewport, etc.
   */
  private async rotateFingerprint(): Promise<void> {
    // Cambiar User-Agent
    const newUserAgent = this.getRandomUserAgent();
    await this.page.setExtraHTTPHeaders({
      'User-Agent': newUserAgent,
    });

    // Cambiar viewport a un tamaño ligeramente diferente
    const widths = [1280, 1366, 1440, 1920];
    const heights = [720, 768, 900, 1080];

    const randomWidth = widths[Math.floor(Math.random() * widths.length)];
    const randomHeight = heights[Math.floor(Math.random() * heights.length)];

    await this.page.setViewportSize({
      width: randomWidth,
      height: randomHeight,
    });

    this.logger.log(
      `Fingerprint rotado: ${newUserAgent} (${randomWidth}x${randomHeight})`,
    );

    // Pequeña pausa después de cambiar el fingerprint
    await this.esperaAleatoria(1000, 2000);
  }

  /**
   * Procesa un producto individual
   */
  private async scrapeZapatillaDetail(url: string): Promise<ZapatillaScraped> {
    // Navegar a la página del producto con estrategia de espera más robusta
    const response = await this.page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    if (!response || response.status() >= 400) {
      throw new Error(`Error al cargar producto: ${response?.status()}`);
    }

    // Esperar a que se cargue la información clave del producto
    try {
      // Implementar una estrategia más robusta para manejar diferentes versiones de la página
      try {
        // Primero intentamos buscar selectores más específicos con timeout reducido
        await Promise.race([
          this.page.waitForSelector('.page-title', { timeout: 5000 }),
          this.page.waitForSelector('.product-info-price', { timeout: 5000 }),
          this.page.waitForSelector('.product-info-main', { timeout: 5000 }),
        ]);
      } catch (error) {
        // Si los selectores específicos no funcionan, buscar elementos más genéricos
        this.logger.warn('No se encontraron selectores específicos, buscando selectores alternativos...');
        
        // Capturar un screenshot para depuración
        await this.page.screenshot({ path: `debug_footdistrict_${Date.now()}.png` });
        
        try {
          // Buscar cualquier encabezado o contenedor de producto
          await Promise.race([
            this.page.waitForSelector('h1', { timeout: 5000 }),
            this.page.waitForSelector('.price, [class*="price"], [class*="product"]', { timeout: 5000 }),
            this.page.waitForSelector('div[class*="product"]', { timeout: 5000 }),
            // Selectores muy genéricos como último recurso
            this.page.waitForSelector('body', { timeout: 5000 }),
          ]);
          
          // Si llegamos aquí, se encontró al menos un selector genérico
          this.logger.log('Se encontraron selectores alternativos genéricos');
        } catch (secondError) {
          // Verificar si estamos ante un CAPTCHA o bloqueo
          const isCaptcha = await this.checkForCaptcha();
          if (isCaptcha) {
            throw new Error('Se ha detectado un CAPTCHA en la página');
          }
          
          // Verificar si hay otros indicios de bloqueo
          const isBlocked = await this.page.evaluate(() => {
            return document.body.innerText.toLowerCase().includes('acceso denegado') || 
                   document.body.innerText.toLowerCase().includes('access denied') ||
                   document.body.innerText.toLowerCase().includes('403') ||
                   document.title.toLowerCase().includes('403');
          });
          
          if (isBlocked) {
            throw new Error('Acceso bloqueado por el sitio (403 Forbidden)');
          }
          
          throw new Error('No se pudo cargar la información del producto - página no reconocida');
        }
      }
    } catch (error) {
      // Si no encuentra los selectores principales, comprobar si estamos ante un CAPTCHA
      const isCaptcha = await this.checkForCaptcha();
      if (isCaptcha) {
        throw new Error('Se ha detectado un CAPTCHA en la página');
      }
      throw new Error('No se pudo cargar la información del producto');
    }

    // Simulamos movimiento de ratón y scroll para parecer más humano
    await this.simulateHumanInteractionWithProduct();

    // Extraer información del producto
    const productData = await this.page.evaluate((pageUrl) => {
      // Función auxiliar para extraer texto con manejo de errores
      const getText = (selector: string): string => {
        try {
          const element = document.querySelector(selector);
          return element ? element.textContent?.trim() || '' : '';
        } catch {
          return '';
        }
      };

      // Función auxiliar para extraer atributos
      const getAttribute = (selector: string, attribute: string): string => {
        try {
          const element = document.querySelector(selector);
          return element ? element.getAttribute(attribute) || '' : '';
        } catch {
          return '';
        }
      };

      // Basado en las capturas, el título completo que contiene marca y modelo está en el span con clase "base"
      // dentro de h1.page-title o span.page-title-wrapper
      const tituloCompleto = getText('h1.page-title span.base') || 
                             getText('span.page-title-wrapper') || 
                             getText('.product-title') || 
                             getText('.page-title');
                             
      console.log(`Título completo extraído: "${tituloCompleto}"`);
      
      // Intentar extraer marca de enlaces específicos para marcas
      let marca = getText('.amshopby-option-link a[title="New Balance"]') || 
                  getText('.amshopby-option-link a');
                  
      // Si no encontramos la marca en un enlace específico, intentar extraerla del título
      // Sabemos por las capturas que el formato típico es "MARCA MODELO"
      if (!marca && tituloCompleto) {
        // Asumir que la primera palabra es la marca
        const primeraPalabra = tituloCompleto.split(' ')[0];
        if (primeraPalabra) {
          marca = primeraPalabra;
        }
        
        // Verificar si es "New Balance" en vez de solo "New"
        if (marca.toLowerCase() === 'new' && tituloCompleto.toLowerCase().includes('new balance')) {
          marca = 'New Balance';
        }
      }
      
      console.log(`Marca extraída: "${marca}"`);
      
      // Extraer el modelo del título, eliminando la marca si la tenemos
      let modelo = tituloCompleto;
      
      if (marca && tituloCompleto.startsWith(marca)) {
        modelo = tituloCompleto.substring(marca.length).trim();
      } else if (marca && tituloCompleto.toLowerCase().startsWith(marca.toLowerCase())) {
        modelo = tituloCompleto.substring(marca.length).trim();
      } else if (marca === 'New Balance' && tituloCompleto.startsWith('New ')) {
        modelo = tituloCompleto.substring(12).trim(); // "New Balance " = 12 caracteres
      }
      
      console.log(`Modelo extraído: "${modelo}"`);
      
      // Extraer el SKU - basado en la captura 6, está en un elemento <li> con un <strong>Referencia</strong>
      let sku = '';
      
      // Buscar el SKU en elementos de lista que contengan "Referencia" o similar
      const listItems = document.querySelectorAll('li');
      listItems.forEach((li) => {
        const text = li.textContent || '';
        if (text.includes('Referencia:')) {
          // El formato parece ser "Referencia: <SKU>"
          const skuMatch = text.match(/Referencia:\s*"?([^"]+)"?/i);
          if (skuMatch && skuMatch[1]) {
            sku = skuMatch[1].trim();
            console.log(`SKU extraído de li: "${sku}"`);
          }
        }
      });
      
      // Si no encontramos el SKU en elementos de lista, buscar en el contenido de la descripción
      if (!sku) {
        const descripcionText = getText('.product-info-main .description') || 
                               getText('.product-info-detailed') || 
                               getText('.product.attribute.description');
                               
        if (descripcionText) {
          const skuMatch = descripcionText.match(/Referencia:\s*"?([^"]+)"?/i) || 
                           descripcionText.match(/SKU:\s*"?([^"]+)"?/i) || 
                           descripcionText.match(/Código:\s*"?([^"]+)"?/i);
                           
          if (skuMatch && skuMatch[1]) {
            sku = skuMatch[1].trim();
            console.log(`SKU extraído de descripción: "${sku}"`);
          }
        }
      }
      
      // Si todavía no tenemos SKU, intentar obtenerlo de metadatos o atributos data-*
      if (!sku) {
        const skuFromData = getAttribute('[data-product-sku]', 'data-product-sku') || 
                           getAttribute('[data-item-id]', 'data-item-id') || 
                           getAttribute('[data-sku]', 'data-sku');
                           
        if (skuFromData) {
          sku = skuFromData;
          console.log(`SKU extraído de atributos data-*: "${sku}"`);
        }
      }
      
      // Si aún no tenemos SKU, buscarlo con un selector más específico
      // Por ejemplo, puede estar en un elemento con clase product-info o data-content
      if (!sku) {
        // Basado en la captura 6, podría estar dentro de un li con Referencia
        const referenceElements = document.querySelectorAll('li:contains("Referencia")');
        if (referenceElements.length > 0) {
          const text = referenceElements[0].textContent || '';
          const skuMatch = text.match(/Referencia:\s*"?([^"]+)"?/i);
          if (skuMatch && skuMatch[1]) {
            sku = skuMatch[1].trim();
            console.log(`SKU extraído de elemento específico: "${sku}"`);
          }
        }
      }
      
      // Extraer el precio
      const precioText = getText('.product-info-price .price') || 
                         getText('.price-box .price') || 
                         getText('.product-info-main .price');
                         
      console.log(`Texto del precio extraído: "${precioText}"`);
      
      let precio = 0;
      if (precioText) {
        // Extraer números del texto del precio (asumiendo formato "100,00 €" o "€100.00")
        const precioMatch = precioText.match(/(\d+(?:[,.]\d+)?)/);
        if (precioMatch) {
          precio = parseFloat(precioMatch[0].replace(',', '.'));
          console.log(`Precio procesado: ${precio}`);
        }
      }
      
      // Obtener la URL de la imagen
      let imagen = '';
      const imgElement = document.querySelector('.product.media img.product-image-photo') || 
                         document.querySelector('.gallery-placeholder img') || 
                         document.querySelector('.product-image-container img');
      
      if (imgElement) {
        imagen = imgElement.getAttribute('src') || imgElement.getAttribute('data-src') || '';
        // Si la imagen es relativa, convertirla a absoluta
        if (imagen && !imagen.startsWith('http')) {
          if (imagen.startsWith('/')) {
            const baseUrl = window.location.origin;
            imagen = baseUrl + imagen;
          } else {
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            imagen = baseUrl + imagen;
          }
        }
        console.log(`URL de imagen extraída: "${imagen}"`);
      }
      
      // Extraer descripción del producto si existe
      const descripcion = getText('.product.attribute.description') || 
                          getText('.product-info-detailed .description') || 
                          getText('.product-info-main .description');
      
      // Extraer tallas disponibles - basado en las capturas, las tallas están en botones o elementos de una guía de tallas
      const tallasElements = document.querySelectorAll('.guia-de-tallas button, .size-guide button, .product-options-wrapper .swatch-option, .product-options-wrapper select option');
      
      const tallas: { talla: string; disponible: boolean }[] = [];
      
      tallasElements.forEach((element) => {
        // El valor de la talla está en diferentes atributos según el tipo de elemento
        let tallaTexto = '';
        
        if (element.getAttribute('data-option-label')) {
          tallaTexto = element.getAttribute('data-option-label') || '';
        } else if (element.textContent) {
          tallaTexto = element.textContent.trim();
        } else if (element.getAttribute('value')) {
          tallaTexto = element.getAttribute('value') || '';
        }
        
        // Solo procesar elementos que tienen texto y no son la opción por defecto "Elige tu talla"
        if (tallaTexto && !tallaTexto.includes('Elige') && !tallaTexto.includes('Choose')) {
          // Determinar si está disponible (no tiene clase 'disabled' y no contiene "Agotado")
          const disponible = !element.classList.contains('disabled') && 
                             !element.hasAttribute('disabled') && 
                             !tallaTexto.toLowerCase().includes('agotado');
          
          tallas.push({
            talla: tallaTexto.trim(),
            disponible
          });
          
          console.log(`Talla: "${tallaTexto.trim()}", Disponible: ${disponible}`);
        }
      });
      
      // Si no encontramos tallas con los selectores anteriores, buscar en otras estructuras
      if (tallas.length === 0) {
        // Intentar con botones específicos de talla o elementos div con clases como 'size'
        const otherSizeElements = document.querySelectorAll('.size button, .tallas div, .swatch-attribute.size .swatch-option');
        
        otherSizeElements.forEach((element) => {
          const tallaTexto = element.textContent?.trim() || element.getAttribute('data-option-label') || '';
          
          if (tallaTexto && !tallaTexto.includes('Elige')) {
            const disponible = !element.classList.contains('disabled') && 
                              !element.classList.contains('out-of-stock') && 
                              !element.hasAttribute('disabled');
            
            tallas.push({
              talla: tallaTexto,
              disponible
            });
            
            console.log(`Talla alternativa: "${tallaTexto}", Disponible: ${disponible}`);
          }
        });
      }
      
      // Extraer el color si está disponible
      let color = '';
      const colorElement = document.querySelector('.product-info-main .color') || 
                          document.querySelector('.swatch-attribute.color .swatch-attribute-selected-option');
      
      if (colorElement) {
        color = colorElement.textContent?.trim() || '';
      } else {
        // Intentar extraer del título o descripción si contiene información de color
        const colorIndicators = ['color', 'colorway', 'beige', 'negro', 'blanco', 'azul', 'rojo', 'verde', 'gris'];
        
        // Buscar en el título o modelo
        for (const indicator of colorIndicators) {
          if (modelo.toLowerCase().includes(indicator)) {
            // Extraer el color basado en palabras clave
            const colorWords = modelo.split(' ').filter(word => 
              word.toLowerCase() === indicator || 
              word.toLowerCase().includes(indicator)
            );
            
            if (colorWords.length > 0) {
              color = colorWords.join(' ');
              break;
            }
          }
        }
      }
      
      // Si aún no tenemos el SKU, intentar extraerlo de la URL
      if (!sku && pageUrl) {
        const urlPartes = pageUrl.split('/');
        const nombreProducto = urlPartes[urlPartes.length - 1];
        
        // Extraer el SKU del nombre del producto en la URL
        // Formato típico: new-balance-u9060-eel-u9060eel.html
        const skuMatch = nombreProducto.match(/([a-zA-Z0-9]+-[a-zA-Z0-9]+)\.html$/);
        if (skuMatch && skuMatch[1]) {
          sku = skuMatch[1];
          console.log(`SKU extraído de URL: "${sku}"`);
        }
      }
      
      // Devolver los datos extraídos
      return {
        marca,
        modelo,
        precio,
        imagen,
        descripcion,
        color,
        sku,
        tallas,
        modeloOriginal: tituloCompleto,
      };
    }, url);

    // Si no se pudo extraer un SKU válido, generar uno basado en marca y modelo
    let sku = productData.sku;
    if (!sku || sku.length < 3) {
      this.logger.warn(
        `SKU inválido o vacío: "${sku}". Generando uno basado en marca y modelo.`,
      );
      // Generar un SKU basado en marca y modelo
      sku = this.generarSKU(productData.marca, productData.modelo);
    }

    // Normalizar marca y modelo
    const marcaNormalizada = this.normalizarMarca(productData.marca);
    const modeloNormalizado = this.limpiarTexto(productData.modelo);
    
    // Filtrar tallas vacías
    const tallasFiltradas = (productData.tallas || []).filter(
      (t) => t && t.talla && t.talla.trim() !== '',
    ) as TallaScraped[];

    this.logger.log(
      `Se encontraron ${tallasFiltradas.length} tallas para: ${marcaNormalizada} ${modeloNormalizado}`,
    );

    // Generar el objeto zapatilla
    const zapatilla: ZapatillaScraped = {
      marca: marcaNormalizada,
      modelo: modeloNormalizado,
      sku: sku,
      imagen: productData.imagen,
      descripcion: this.limpiarTexto(productData.descripcion),
      precio: productData.precio,
      url_producto: url,
      tallas: tallasFiltradas,
      tienda_id: this.tiendaInfo.id,
      modelo_tienda: this.limpiarTexto(productData.modeloOriginal),
      color: productData.color || '',
      fecha_scrape: new Date(),
    };

    // Log para depuración
    this.logger.log(
      `Producto extraído: ${JSON.stringify({
        sku: zapatilla.sku,
        marca: zapatilla.marca,
        modelo: zapatilla.modelo,
        color: zapatilla.color,
        tallas: zapatilla.tallas.length,
        url: zapatilla.url_producto,
      })}`,
    );

    return zapatilla;
  }

  /**
   * Simula interacción humana con la página de producto
   */
  private async simulateHumanInteractionWithProduct(): Promise<void> {
    // Esperar un tiempo aleatorio para simular lectura inicial
    await this.esperaAleatoria(1000, 3000);

    // Intentar cerrar cualquier popup que pueda interferir
    try {
      // Buscar y cerrar popups comunes
      await this.page.evaluate(() => {
        // Buscar elementos comunes de popups
        const popupSelectors = [
          '.modal-popup',
          '.modal-slide',
          '.modal-content',
          '.newsletter-popup',
          '#newsletter_popup',
          '.popup-container'
        ];
        
        // Intentar ocultar cada posible popup
        for (const selector of popupSelectors) {
          const popupElement = document.querySelector(selector);
          if (popupElement) {
            console.log('Ocultando popup: ' + selector);
            (popupElement as HTMLElement).style.display = 'none';
            // También intentar eliminar cualquier overlay
            const overlays = document.querySelectorAll('.modals-overlay, .modal-bg, .overlay');
            overlays.forEach(el => {
              (el as HTMLElement).style.display = 'none';
            });
          }
        }
      });
      
      // Esperar brevemente después de intentar cerrar popups
      await this.esperaAleatoria(300, 700);
    } catch (error) {
      this.logger.debug('Error al intentar cerrar popups', error);
    }

    // Hacer scroll suave hacia abajo para ver la información del producto
    await this.page.evaluate(() => {
      const maxScroll = Math.min(document.body.scrollHeight, 1500);
      const scrollSteps = 8;
      const scrollDelay = 120;

      return new Promise<void>((resolve) => {
        let currentStep = 0;
        const scrollInterval = setInterval(() => {
          if (currentStep < scrollSteps) {
            const nextPosition = (currentStep + 1) * (maxScroll / scrollSteps);
            window.scrollTo({
              top: nextPosition,
              behavior: 'smooth',
            });
            currentStep++;
          } else {
            clearInterval(scrollInterval);
            resolve();
          }
        }, scrollDelay);
      });
    });

    // Interactuar con elementos de la página sin usar hover (para evitar errores con popups)
    try {
      // En lugar de hover, solo identificamos las imágenes de producto
      const productImages = await this.page.$$('.product.media img, .gallery-placeholder img');
      if (productImages.length > 0) {
        this.logger.debug(`Encontradas ${productImages.length} imágenes de producto`);        
      }

      // Volver a subir un poco la página
      await this.page.evaluate(() => {
        window.scrollTo({
          top: window.scrollY - 300,
          behavior: 'smooth',
        });
      });

      await this.esperaAleatoria(500, 1000);
    } catch (error) {
      // Ignorar errores de interacción, no son críticos
      this.logger.debug('Error al simular interacción con el producto', error);
    }
  }

  /**
   * Comprueba si la página contiene un CAPTCHA
   */
  private async checkForCaptcha(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const pageContent = document.body.innerText.toLowerCase();
      const pageTitle = document.title.toLowerCase();
      const captchaIndicators = [
        'captcha',
        'robot',
        'verificar',
        'verify you are human',
        'verificar que eres humano',
        'comprobar',
        'verificación',
        'verification',
        'not a robot',
        'no soy un robot',
        'security check',
        'comprobación de seguridad',
        'desafío',
        'challenge',
        'blocked',
        'bloqueado',
        'access denied',
        'acceso denegado',
        'protection',
        'protección',
        'forbidden',
        'prohibido',
      ];

      // Buscar indicadores en el contenido de la página
      const contentCheck = captchaIndicators.some(indicator => 
        pageContent.includes(indicator)
      );
      
      // Buscar indicadores en el título
      const titleCheck = captchaIndicators.some(indicator => 
        pageTitle.includes(indicator)
      );
      
      // Verificar la presencia de elementos de CAPTCHA comunes
      const recaptchaPresent = !!document.querySelector('iframe[src*="recaptcha"]') || 
                              !!document.querySelector('div.g-recaptcha') ||
                              !!document.querySelector('iframe[src*="captcha"]');
      
      // Comprobar si la página tiene errores HTTP comunes
      const hasErrorCodes = pageContent.includes('403') || 
                          pageContent.includes('503') ||
                          pageContent.includes('429') ||
                          pageTitle.includes('403');
      
      return contentCheck || titleCheck || recaptchaPresent || hasErrorCodes;
    });
  }
  
  /**
   * Intenta resolver un bloqueo rotando IP y cambiando el fingerprint
   */
  private async tryToBypassBlock(): Promise<boolean> {
    this.logger.warn('Intentando evadir bloqueo - rotando fingerprint...');
    
    try {
      // Cambiar completamente el User-Agent
      const mobileUserAgents = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/96.0.4664.116 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.104 Mobile Safari/537.36',
      ];
      
      // Seleccionar un User-Agent móvil aleatorio (diferente fingerprint)
      const randomMobileUA = mobileUserAgents[Math.floor(Math.random() * mobileUserAgents.length)];
      
      // Reconfigurar el contexto con un nuevo fingerprint
      await this.page.setExtraHTTPHeaders({
        'User-Agent': randomMobileUA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'DNT': '1'
      });
      
      // Simular un dispositivo móvil
      await this.page.setViewportSize({
        width: 375, 
        height: 812
      });
      
      // Establecer localStorage para parecer una nueva sesión
      await this.page.evaluate(() => {
        try {
          localStorage.clear();
          sessionStorage.clear();
          
          // Cookies (simuladas vía JS)
          document.cookie = "_ga=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          document.cookie = "_gid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        } catch (e) {
          // Ignorar errores de acceso a storage (en caso de acceso restringido)
          console.error('Error al limpiar storage:', e);
        }
      });
      
      this.logger.log('Fingerprint rotado a dispositivo móvil');
      return true;
    } catch (error) {
      this.logger.error(`Error al intentar evadir bloqueo: ${error.message}`);
      return false;
    }
  }
}
