// src/scraper/tiendas/footlocker-scraper.ts
import { Injectable } from '@nestjs/common';
import { BaseTiendaScraper } from './base-tienda-scraper';
import {
  ZapatillaScraped,
  TiendaInfo,
  TallaScraped,
} from '../interfaces/quimera-scraper.interface';

@Injectable()
export class FootlockerScraper extends BaseTiendaScraper {
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
   * Método principal para raspar zapatillas de Footlocker
   * Mejorado para navegar a través de múltiples páginas si es necesario
   */
  async scrapeZapatillas(): Promise<ZapatillaScraped[]> {
    try {
      await this.initBrowser(this.getRandomUserAgent());

      // URL base para las páginas de productos
      const baseUrl =
        'https://footlocker.es/es/category/hombre/zapatillas/sneakers.html';
      
      // Configurar evasion de fingerprinting
      await this.setupBrowserEvasion();
      
      // Set para rastrear URLs ya procesadas y evitar duplicados
      const processedUrls = new Set<string>();
      
      // Array para almacenar los resultados
      const zapatillas: ZapatillaScraped[] = [];
      
      // Variables para control de paginación
      let currentPage = 1;
      let hasMorePages = true;
      let consecutiveEmptyPages = 0; // Contador para detectar cuando no hay más páginas
      
      // Continuar mientras tengamos más páginas y no hayamos alcanzado el límite de zapatillas
      while (hasMorePages && (!this.options?.maxItems || zapatillas.length < this.options.maxItems) && consecutiveEmptyPages < 2) {
        // Construir URL para la primera página
        const url = baseUrl;
        
        this.logger.log(`Navegando a página ${currentPage}`);
        
        // Si no es la primera página, necesitamos hacer clic en el botón "Siguiente"
        if (currentPage > 1) {
          try {
            // Buscar el botón "Siguiente" por su aria-label o texto
            const nextBtnSelector = '[aria-label="Ir a la página siguiente"], a:has-text("Siguiente")';
            
            // Verificar si existe el botón
            const nextBtnExists = await this.page.$(nextBtnSelector);
            if (!nextBtnExists) {
              this.logger.warn(`No se encontró el botón "Siguiente" para la página ${currentPage}. Finalizando.`);
              hasMorePages = false;
              break;
            }
            
            // Hacer clic en el botón "Siguiente"
            this.logger.log(`Haciendo clic en el botón "Siguiente" para ir a la página ${currentPage}`);
            await this.page.click(nextBtnSelector);
            
            // Esperar a que se cargue la página
            await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
            
            // Esperar un tiempo adicional para asegurar que todo se cargue
            await this.esperaAleatoria(2000, 4000);
          } catch (error) {
            this.logger.error(`Error al navegar a la página ${currentPage}: ${error instanceof Error ? error.message : String(error)}`);
            hasMorePages = false;
            break;
          }
        } else {
          // Navegar a la URL base (primera página) con opciones avanzadas de espera
          const response = await this.page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 60000,
          });

          if (!response || response.status() >= 400) {
            this.logger.error(
              `Error de navegación en página ${currentPage}: ${response?.status()} - ${response?.statusText()}`,
            );
            break; // Salir del bucle si hay un error de navegación
          }
        }

        // Gestionar cookies - verificar si existe el banner antes de intentar cerrarlo
        await this.handleCookieConsent();

        // Simular desplazamiento humano en la página
        await this.simulateHumanScrolling();

        // Asegurar que la lista de productos está completamente cargada
        const productListSelector = 'li.product-container';
        try {
          await this.page.waitForSelector(productListSelector, { timeout: 30000 });
        } catch (error) {
          this.logger.warn(`No se encontraron productos en la página ${currentPage}. Puede que hayamos alcanzado el final.`);
          consecutiveEmptyPages++;
          
          if (consecutiveEmptyPages >= 2) {
            this.logger.log(`Dos páginas consecutivas sin productos. Finalizando la paginación.`);
            break;
          }
          
          // Intentar siguiente página
          currentPage++;
          continue;
        }

        // Extraer URLs de los productos con el selector actualizado según la imagen
        const productUrls = await this.extractProductUrls(productListSelector);
        
        // Filtrar productos ya procesados para evitar duplicados
        const newProductUrls = productUrls.filter(url => !processedUrls.has(url));
        
        this.logger.log(`Página ${currentPage}: Encontrados ${productUrls.length} productos, ${newProductUrls.length} son nuevos`);
        
        if (newProductUrls.length === 0) {
          this.logger.warn(`No hay productos nuevos en la página ${currentPage}. Posible duplicación de contenido.`);
          consecutiveEmptyPages++;
          
          if (consecutiveEmptyPages >= 2) {
            this.logger.log(`Dos páginas consecutivas sin productos nuevos. Finalizando la paginación.`);
            break;
          }
          
          // Intentar siguiente página
          currentPage++;
          continue;
        } else {
          // Reiniciar contador si encontramos productos nuevos
          consecutiveEmptyPages = 0;
        }

        // Calcular cuántos productos podemos procesar sin exceder el límite
        const remainingItems = this.options?.maxItems ? this.options.maxItems - zapatillas.length : newProductUrls.length;
        const limitedUrls = remainingItems > 0 ? newProductUrls.slice(0, remainingItems) : [];
        
        this.logger.log(`Procesando ${limitedUrls.length} productos de la página ${currentPage}. Total hasta ahora: ${zapatillas.length}${this.options?.maxItems ? `/${this.options.maxItems}` : ''}`);

        // Procesar cada URL de producto con reintentos
        for (const [index, url] of limitedUrls.entries()) {
          try {
            // Marcar la URL como procesada para evitar duplicados
            processedUrls.add(url);
            
            this.logger.log(
              `Procesando producto ${index + 1}/${limitedUrls.length} (total: ${zapatillas.length + 1}/${this.options?.maxItems || 'sin límite'}): ${url}`,
            );

            // Implementar sistema de reintentos para productos individuales
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

                // Si es posible, cambiar User-Agent entre reintentos
                await this.page.setExtraHTTPHeaders({
                  'User-Agent': this.getRandomUserAgent(),
                });
              }
            }

            // Esperar un tiempo aleatorio entre peticiones (más largo para evitar detección)
            await this.esperaAleatoria(3000, 7000);

            // Cada cierto número de productos, cambiar fingerprint
            if (index > 0 && index % 5 === 0) {
              await this.rotateFingerprint();
            }

            // Verificar si hemos alcanzado el máximo de elementos
            if (this.options?.maxItems && zapatillas.length >= this.options.maxItems) {
              this.logger.log(`Se alcanzó el límite máximo de ${this.options.maxItems} productos. Finalizando.`);
              hasMorePages = false;
              break;
            }
          } catch (error) {
            this.logger.error(
              `Error al procesar ${url}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        // Si aún necesitamos más productos, avanzar a la siguiente página
        if (!this.options?.maxItems || zapatillas.length < this.options.maxItems) {
          // Avanzamos a la siguiente página 
          currentPage++;
          this.logger.log(`AVANZANDO A LA SIGUIENTE PÁGINA: ${currentPage}`);
          this.logger.log(`Zapatillas procesadas hasta ahora: ${zapatillas.length}${this.options?.maxItems ? `/${this.options.maxItems}` : ''}`);
          
          // Esperar un tiempo entre páginas para evitar detección
          await this.esperaAleatoria(5000, 10000);
          
          // Cambiar fingerprint entre páginas
          await this.rotateFingerprint();
        } else {
          // Ya tenemos suficientes productos
          this.logger.log(`Se alcanzó o superó el número máximo de productos requerido (${this.options?.maxItems}). Finalizando.`);
          hasMorePages = false;
        }
      }

      const maxItemsStr = this.options?.maxItems ? `/${this.options.maxItems} solicitados` : '';
      this.logger.log(
        `Scraping completado. Se procesaron ${zapatillas.length}${maxItemsStr} productos a través de ${currentPage} páginas.`,
      );
      
      if (this.options?.maxItems && zapatillas.length < this.options.maxItems) {
        this.logger.log(`NOTA: No se alcanzó el número solicitado de ${this.options.maxItems} productos. Es posible que se hayan acabado las páginas disponibles.`);
      }
      
      // Estadísticas finales
      this.logger.log(`Total de URLs únicas procesadas: ${processedUrls.size}`);
      
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
    await this.page.addInitScript(() => {
      // Ocultar webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Simular plugin de Chrome
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
        ],
      });

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

          // Pequeña perturbación en los datos para evitar fingerprinting
          for (let i = 0; i < imageData.data.length; i += 100) {
            if (imageData.data[i] % 2 === 0) {
              imageData.data[i] += 1;
            }
          }

          return imageData;
        };
      }
    });
  }

  /**
   * Gestionar el banner de consentimiento de cookies
   */
  private async handleCookieConsent(): Promise<void> {
    try {
      // Basado en la última captura, vemos que el botón dice "Aceptar solo lo necesario"
      const cookieSelectors = [
        'button:has-text("Aceptar solo lo necesario")',
        'button:has-text("Aceptar todas las cookies")',
        '#onetrust-accept-btn-handler',
        'button[aria-label="Aceptar todas las cookies"]',
        '.cookie-banner .accept-all',
        '.cookie-consent-banner__accept',
        'button[data-testid="cookie-accept-all"]',
        '.cookie-consent button.primary',
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

    // Basado en la tercera captura, vemos que los enlaces de productos están en
    // <a class="ProductCard-link ProductCard-content crbx-badge" target="_self" tabindex="0" href="/es/product/adidas-megaride-hombre-zapatillas/314209908004.html">
    const productUrls = await this.page.evaluate((selector) => {
      // Función para obtener las URLs actualmente visibles
      const getVisibleUrls = () => {
        // Basado en la estructura de la tercera captura, buscar enlaces dentro de ProductCard-link
        const links = Array.from(
          document.querySelectorAll(`${selector} a.ProductCard-link`),
        );

        // Si no encuentra enlaces con ese selector, probar con una selección más general
        if (links.length === 0) {
          // Selector alternativo más flexible basado en atributos de URL
          const alternativeLinks = Array.from(document.querySelectorAll(`${selector} a`))
            .filter((element) => {
              // Verificar que el elemento es un HTMLAnchorElement y tiene href
              return (
                element instanceof HTMLAnchorElement &&
                element.href &&
                element.href.includes('/product/')
              );
            });
            
          if (alternativeLinks.length === 0) {
            // Tercer intento: buscar cualquier enlace con href que contenga /product/
            return Array.from(document.querySelectorAll('a[href*="/product/"]'))
              .map((element) => (element as HTMLAnchorElement).href);
          }
          
          return alternativeLinks.map((element) => (element as HTMLAnchorElement).href);
        }

        return links.map((link) => (link as HTMLAnchorElement).href);
      };

      // DEPURACIÓN: Imprimir información sobre los selectores y enlaces encontrados
      console.log(`Buscando productos con selector: ${selector}`);
      const urls = getVisibleUrls();
      console.log(`Se encontraron ${urls.length} URLs de productos`);
      return urls;
    }, selector);

    // Eliminar duplicados y URLs vacías
    const uniqueUrls = [...new Set(productUrls)].filter((url) => url && url.length > 0);
    
    this.logger.log(`Extracción de URLs: ${uniqueUrls.length} productos únicos encontrados`);
    return uniqueUrls;
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

    // Esperar a que se cargue la información clave del producto con timeout generoso
    // Basado en la cuarta captura, buscamos el contenedor principal del producto
    try {
      await this.page.waitForSelector('.ProductDetails', { timeout: 30000 });
    } catch (error) {
      // Si no encuentra el selector principal, comprobar si estamos ante un CAPTCHA
      const isCaptcha = await this.checkForCaptcha();
      if (isCaptcha) {
        throw new Error('Se ha detectado un CAPTCHA en la página');
      }
      throw new Error('No se pudo cargar la información del producto');
    }

    // Simulamos movimiento de ratón y scroll para parecer más humano
    await this.simulateHumanInteractionWithProduct();

    // Hacer clic en el tab de detalles para asegurarnos de que esté abierto y se pueda acceder al SKU
    // Basado en la tercera imagen, necesitamos hacer clic en el botón para acceder a los detalles
    try {
      // Intentar hacer clic en el tab de detalles si está cerrado
      const tabSelector = 'button.Tab[id^="ProductDetails-tabs-details-tab"]';
      const tabExists = await this.page.$(tabSelector);
      if (tabExists) {
        await this.page.click(tabSelector);
        this.logger.log('Hecho clic en el tab de detalles para acceder al SKU');
        // Dar tiempo para que se expanda el contenido
        await this.esperaAleatoria(1000, 2000);
      }
    } catch (error) {
      this.logger.warn('No se pudo hacer clic en el tab de detalles:', error);
    }

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

      // MEJORA: Imprimir toda la estructura del HTML del producto para depuración
      console.log('Estructura HTML de la página de producto:');
      const htmlEstructura =
        document.querySelector('.ProductDetails')?.outerHTML ||
        document.body.innerHTML;
      console.log(htmlEstructura.substring(0, 500) + '...');
      
      // Buscar todos los atributos atvec-* en la página para diagnóstico
      console.log('Buscando atributos atvec-* en la página:');
      const elementosAtvec = document.querySelectorAll('[atvec-brand], [atvec-sku], [atvec-category], [atvec-modelnumber], [atvec-genderage]');
      console.log(`Encontrados ${elementosAtvec.length} elementos con atributos atvec-*`);
      
      elementosAtvec.forEach((elemento, idx) => {
        console.log(`Elemento atvec #${idx + 1}:`);
        console.log(` - atvec-brand: ${elemento.getAttribute('atvec-brand') || 'no disponible'}`);
        console.log(` - atvec-sku: ${elemento.getAttribute('atvec-sku') || 'no disponible'}`);
        console.log(` - atvec-modelnumber: ${elemento.getAttribute('atvec-modelnumber') || 'no disponible'}`);
        console.log(` - atvec-genderage: ${elemento.getAttribute('atvec-genderage') || 'no disponible'}`);
        console.log(` - atvec-category: ${elemento.getAttribute('atvec-category') || elemento.getAttribute('atvec-categorytype') || 'no disponible'}`);
        console.log(` - tagName: ${elemento.tagName}`);
      });

      // ***** SOLUCIÓN AL BUG: DETECCIÓN CORRECTA DE MARCA Y MODELO *****
      
      // PASO 1: BUSCAR TODAS LAS FUENTES POSIBLES DE MARCA
      
      // 1a. Buscar atributo atvec-brand en div#app
      const divApp = document.querySelector('div#app');
      console.log('=== DIV APP ATRIBUTOS ===');
      if (divApp) {
        console.log('Encontrado div#app con estos atributos:');
        const attrNames = divApp.getAttributeNames();
        console.log(`Atributos: ${attrNames.join(', ')}`);
        attrNames.forEach(attr => console.log(`${attr}: "${divApp.getAttribute(attr)}"`));
      } else {
        console.log('No se encontró div#app');
      }
      
      // 1b. Analizar URL para detección de marca en URL
      console.log(`URL página: ${pageUrl}`);
      
      // 1c. Verificar todos los elementos con atvec-brand
      const elementosConMarca = document.querySelectorAll('[atvec-brand]');
      console.log(`Encontrados ${elementosConMarca.length} elementos con atributo atvec-brand`);
      
      // PASO 2: DECIDIR LA MARCA A USAR
      
      // Definir marca: primero desde atributos, luego desde URL, finalmente de la primera palabra del nombre
      let marcaAtributo = '';
      
      // 2a. Intentar obtener de cualquier elemento con atributo atvec-brand
      if (elementosConMarca.length > 0) {
        marcaAtributo = elementosConMarca[0].getAttribute('atvec-brand') || '';
        console.log(`Marca obtenida de atvec-brand: "${marcaAtributo}"`);
      }
      
      // 2b. Si no se encontró, buscar en la URL para casos especiales
      if (!marcaAtributo) {
        // Solución para New Balance
        if (pageUrl.toLowerCase().includes('new-balance')) {
          marcaAtributo = 'New Balance';
          console.log(`Marca obtenida de URL (new-balance): "${marcaAtributo}"`);
        }
        // Solución para Adidas
        else if (pageUrl.toLowerCase().includes('/adidas-')) {
          marcaAtributo = 'adidas';
          console.log(`Marca obtenida de URL (adidas): "${marcaAtributo}"`);
        }
        // Solución para Nike
        else if (pageUrl.toLowerCase().includes('/nike-')) {
          marcaAtributo = 'Nike';
          console.log(`Marca obtenida de URL (nike): "${marcaAtributo}"`);
        }
      }
      
      // 2c. Obtener modelo de ProductName-primary
      const modeloTextoCompleto = getText('span.ProductName-primary');
      console.log(`Texto completo del modelo: "${modeloTextoCompleto}"`);
      
      // Marca final (atributo, URL o primera palabra del nombre)
      const marca = marcaAtributo || modeloTextoCompleto.split(' ')[0] || '';
      console.log(`MARCA FINAL ELEGIDA: "${marca}"`);
      
      // PASO 3: EXTRAER MODELO CORRECTO
      let modeloSinMarca = '';
      
      // 3a. Caso New Balance: extraer solo el número después de "New Balance"
      if (marca === 'New Balance' && modeloTextoCompleto.toLowerCase().includes('new balance')) {
        modeloSinMarca = modeloTextoCompleto.replace(/new\s+balance/i, '').trim();
        console.log(`Caso especial New Balance: modelo="${modeloSinMarca}"`);
      }
      // 3b. Caso general: quitar la marca del inicio del modelo
      else if (modeloTextoCompleto.toLowerCase().startsWith(marca.toLowerCase())) {
        modeloSinMarca = modeloTextoCompleto.substring(marca.length).trim();
        console.log(`Marca eliminada del inicio: "${modeloSinMarca}"`);
      }
      // 3c. Si la marca está en otra parte, intentar quitarla con regex
      else if (marca && modeloTextoCompleto.toLowerCase().includes(marca.toLowerCase())) {
        try {
          // Escapar caracteres especiales en la marca para la regex
          const marcaEscapada = marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${marcaEscapada}\\b`, 'i');
          modeloSinMarca = modeloTextoCompleto.replace(regex, '').trim();
          // Eliminar espacios duplicados que puedan quedar
          modeloSinMarca = modeloSinMarca.replace(/\s+/g, ' ').trim();
          console.log(`Marca eliminada con regex: "${modeloSinMarca}"`);
        } catch (e) {
          console.log(`Error al aplicar regex: ${e}`);
          modeloSinMarca = modeloTextoCompleto;
        }
      }
      // 3d. Si no se puede quitar, usar el modelo completo
      else {
        modeloSinMarca = modeloTextoCompleto;
        console.log(`No se pudo quitar marca, usando modelo completo: "${modeloSinMarca}"`);
      }
      
      // PASO 4: CATEGORÍA (no usada para modelo)
      const categoria = getText('span.ProductName-alt');
      console.log(`Categoría (NO usada en el modelo): "${categoria}"`);
      
      // PASO 5: Obtener solo el modelo, sin incluir categoría
      const modeloCompleto = modeloSinMarca.trim();
      console.log(`MODELO FINAL: "${modeloCompleto}"`);

      // Basado en la quinta captura, el precio está en:
      // <span>€ 169,99</span>
      // dentro de div.ProductPrice
      let precioText = getText('div.ProductPrice span');
      console.log('Texto del precio extraído:', precioText);

      // Limpiar el texto del precio y extraer el valor numérico
      let precio = 0;
      if (precioText) {
        const precioMatch = precioText.match(/(\d+[.,]\d+)/);
        if (precioMatch) {
          precio = parseFloat(precioMatch[0].replace(',', '.'));
          console.log('Precio procesado:', precio);
        } else {
          console.log('No se pudo extraer un valor numérico del precio');
        }
      }

      // Obtener imagen principal basado en la segunda captura
      // Buscamos la imagen principal dentro del rol button en la galería
      let imagen = '';
      
      // Método 1: Buscar img dentro de un div con role="button" en la galería (según captura 2)
      console.log('Buscando imagen usando el método basado en la captura 2...');
      const imgGalleryElement = document.querySelector(
        'div[role="button"] img[height][width][alt], span.Image.Image--product img, .GallerySlide--overMainImage img'
      );

      if (imgGalleryElement) {
        imagen = imgGalleryElement.getAttribute('src') || '';
        console.log('URL de imagen extraída de la galería:', imagen);
      }

      // Método 2: Buscar cualquier imagen con altura y anchura especificadas (más genérico)
      if (!imagen) {
        console.log('Método 1 falló, buscando con método alternativo...');
        const imgHeightWidth = document.querySelector('img[height][width][alt*="Image"]');
        if (imgHeightWidth) {
          imagen = imgHeightWidth.getAttribute('src') || '';
          console.log('URL de imagen extraída por altura/anchura:', imagen);
        }
      }

      // Método 3: Si aún no tenemos imagen, buscar en divs específicos de la galería
      if (!imagen) {
        console.log('Método 2 falló, buscando con método específico de galería...');
        const galleryElements = document.querySelectorAll('.slick-slide.slick-active img, .ProductGallery img, .GalleryImages img');
        
        if (galleryElements.length > 0) {
          const mainImg = galleryElements[0];
          imagen = mainImg.getAttribute('src') || '';
          console.log('URL de imagen extraída de la galería:', imagen);
        }
      }

      // Método 4: Último recurso, buscar cualquier imagen que parezca un producto
      if (!imagen) {
        console.log('Todos los métodos anteriores fallaron, buscando cualquier imagen de producto...');
        const allImages = document.querySelectorAll('img');
        console.log('Total de imágenes encontradas:', allImages.length);

        for (const img of allImages) {
          const src = img.getAttribute('src') || '';
          const alt = img.getAttribute('alt') || '';
          if (
            (src.includes('footlocker.com') ||
             src.includes('images.') ||
             src.includes('/image/') ||
             src.includes('/product/')) &&
            !src.includes('icon') &&
            !src.includes('logo')
          ) {
            imagen = src;
            console.log('Imagen encontrada por búsqueda genérica:', imagen);
            console.log('Alt de la imagen:', alt);
            break;
          }
        }
      }

      // Obtener descripción
      const descripcion = getText('.ProductDetails-description') || '';
      console.log(
        'Descripción extraída:',
        descripcion.substring(0, 50) + '...',
      );

      // Basado en la sexta captura, vemos que las tallas están en botones como:
      // <button type="button" data-context='{"type":"button","text":"Size: 40"}' aria-label="Size: 40" class="Button SizeSelector-button-newDesign SizeSelectorNewDesign-button--regional1">
      console.log('Buscando botones de tallas...');

      // Extraer tallas de los botones con aria-label que contienen "Size:"
      const botonesConTalla = document.querySelectorAll(
        'button[aria-label^="Size:"]',
      );
      console.log('Botones con tallas encontrados:', botonesConTalla.length);

      const tallas = Array.from(botonesConTalla)
        .map((boton) => {
          // Extraer la talla del aria-label (Size: 40 -> 40)
          const ariaLabel = boton.getAttribute('aria-label') || '';
          console.log(`Texto completo del aria-label: "${ariaLabel}"`);
          
          const tallaMatch = ariaLabel.match(
            /Size:\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)/,
          );

          const talla = tallaMatch ? tallaMatch[1].trim() : '';

          // Verificar si el botón está deshabilitado o tiene una clase que indique que no está disponible
          const disabled = boton.hasAttribute('disabled');
          const classNameIncludes =
            (boton.className || '').includes('disabled') ||
            (boton.className || '').includes('outOfStock');
            
          // MEJORA IMPORTANTE: Verificar si el aria-label contiene texto adicional como "Agotadas"
          // que indica que la talla no está disponible (como se ve en la captura de pantalla)
          const contienePalabraAgotada = ariaLabel.toLowerCase().includes('agotadas') || 
                                        ariaLabel.toLowerCase().includes('agotados') || 
                                        ariaLabel.toLowerCase().includes('no disponible');
          
          // Si tiene la palabra agotada en el aria-label O está deshabilitado O tiene clase que indica no disponible
          const disponible = !disabled && !classNameIncludes && !contienePalabraAgotada;

          console.log(`Talla encontrada: ${talla}, Disponible: ${disponible}, AriaLabel: "${ariaLabel}"`);

          return {
            talla,
            disponible,
          };
        })
        .filter((t) => t.talla); // Filtrar para eliminar tallas vacías

      // Basado en la tercera captura, el SKU está en el tab de detalles:
      // "Supplier-sku #: " "JP9626"
      console.log('Buscando SKU en el tab de detalles...');

      // El SKU está en un span dentro del div con ID ProductDetails-tabs-details
      let sku = '';

      // Buscar todos los spans dentro del panel de detalles
      // No podemos usar :contains() porque no es un selector válido
      const allDetailsPanelSpans = document.querySelectorAll(
        '#ProductDetails-tabs-details-panel span',
      );
      console.log(
        'Número de spans encontrados en el panel de detalles:',
        allDetailsPanelSpans.length,
      );

      // Recorrer todos los spans buscando el que contiene "Supplier-sku"
      for (let i = 0; i < allDetailsPanelSpans.length; i++) {
        const currentSpanText =
          allDetailsPanelSpans[i].textContent?.trim() || '';
        console.log(`Span ${i}: "${currentSpanText}"`);

        if (currentSpanText.includes('Supplier-sku')) {
          console.log('Encontrado span con "Supplier-sku"');

          // Verificar si el siguiente span existe y contiene el valor del SKU
          if (i + 1 < allDetailsPanelSpans.length) {
            const nextSpan = allDetailsPanelSpans[i + 1];
            const nextSpanText = nextSpan.textContent?.trim() || '';
            console.log('Contenido del span siguiente:', nextSpanText);

            // Verificar si el texto parece un SKU (solo alfanumérico sin espacios)
            if (nextSpanText && /^[A-Za-z0-9-]+$/.test(nextSpanText)) {
              sku = nextSpanText;
              console.log('SKU encontrado en el span siguiente:', sku);
              break;
            }
          }

          // Si no encontramos un SKU válido en el span siguiente,
          // intentamos extraerlo del texto del span actual
          if (!sku) {
            // El SKU podría estar al final del texto del span actual
            const match = currentSpanText.match(
              /Supplier-sku\s*#?\s*:\s*([A-Za-z0-9-]+)/,
            );
            if (match && match[1]) {
              sku = match[1].trim();
              console.log('SKU extraído del texto del span actual:', sku);
              break;
            }
          }
        }
      }

      // Si aún no encontramos el SKU, buscar directamente en todo el contenido del panel
      if (!sku) {
        const detailsPanel = document.querySelector(
          '#ProductDetails-tabs-details-panel',
        );
        if (detailsPanel) {
          const panelText = detailsPanel.textContent || '';
          console.log('Contenido completo del panel de detalles:', panelText);

          // Buscar el patrón "Supplier-sku #: JP9626" en todo el texto
          const skuMatch = panelText.match(
            /Supplier-sku\s*#?\s*:\s*([A-Za-z0-9-]+)/,
          );
          if (skuMatch && skuMatch[1]) {
            sku = skuMatch[1].trim();
            console.log('SKU extraído del texto completo del panel:', sku);
          }
        }
      }

      // Intentar también buscar "Product #" como alternativa
      if (!sku) {
        const productMatch = document.body.textContent?.match(
          /Product\s*#\s*:\s*(\d+)/,
        );
        if (productMatch && productMatch[1]) {
          sku = productMatch[1].trim();
          console.log('SKU extraído de Product #:', sku);
        }
      }
      
      // También buscar el SKU en el atributo atvec-sku
      if (!sku && elementosAtvec.length > 0) {
        for (const elemento of elementosAtvec) {
          const skuAtributo = elemento.getAttribute('atvec-sku');
          if (skuAtributo) {
            sku = skuAtributo;
            console.log('SKU encontrado en atributo atvec-sku:', sku);
            break;
          }
        }
      }

      // Extraer color
      let color = '';
      const colorText =
        getText('p.ProductDetails-form_selectedStyle') ||
        getText('.ProductDetails-form_selectedFontColorV2');

      console.log('Texto de color extraído:', colorText);
      if (colorText) {
        color = colorText.trim();
      }

      // DEPURACIÓN: Imprimir toda la información extraída para verificación
      console.log('DATOS FINALES DEL PRODUCTO:');
      console.log(`- Marca: ${marca}`);
      console.log(`- Modelo: ${modeloCompleto}`);
      console.log(`- Precio: ${precio}`);
      console.log(`- Color: ${color}`);
      console.log(`- SKU: ${sku}`);
      console.log(
        `- Imagen: ${imagen ? imagen.substring(0, 50) + '...' : 'No disponible'}`,
      );
      console.log(`- Número de tallas encontradas: ${tallas.length}`);

      return {
        marca,
        modelo: modeloCompleto,
        precio,
        imagen,
        descripcion,
        color,
        sku,
        tallas,
        categoria, // Agregamos la categoría para tenerla disponible, aunque no se use en el nombre del modelo
      };
    }, url); // Pasamos la URL de la página al callback para detección de marca

    // Si no se pudo extraer un SKU de la página, intentamos extraerlo de la URL o del Product #
    let sku = productData.sku;

    // Si no hay SKU, intentar extraerlo primero del Product # directamente desde la página
    if (!sku) {
      try {
        // Buscar el Product # como se ve en la tercera captura - "Product #: 314209908004"
        const productNumText = await this.page.textContent(
          'div#ProductDetails-tabs-details-panel',
        );
        if (productNumText) {
          const productMatch = productNumText.match(/Product\s*#\s*:\s*(\d+)/);
          if (productMatch && productMatch[1]) {
            sku = productMatch[1].trim();
            this.logger.log(`SKU extraído de Product #: ${sku}`);
          }
        }
      } catch (error) {
        this.logger.warn('Error al extraer Product #:', error);
      }
    }

    // Si todavía no hay SKU, extraerlo de la URL como último recurso
    if (!sku) {
      // Extraer el ID del producto de la URL
      const urlParts = url.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      const skuFromUrl = lastPart.replace('.html', '');
      sku = skuFromUrl;
      this.logger.log(
        `No se encontró SKU en la página, usando URL como fallback: ${sku}`,
      );
    }

    // Verificar que el SKU no contiene texto adicional
    // Si el SKU contiene la palabra "Esta" u otro texto extraño, lo limpiamos
    if (sku && (sku.includes('Esta') || !/^[A-Za-z0-9-]+$/.test(sku))) {
      this.logger.warn(
        `SKU contiene texto no válido: "${sku}". Intentando limpiar...`,
      );
      // Limpiar cualquier texto no alfanumérico
      sku = sku.replace(/[^A-Za-z0-9-]/g, '');
      // Eliminar "Esta" si aparece al final
      sku = sku.replace(/Esta$/i, '');
    }

    // Asegurarnos que el SKU tiene un formato correcto y no está vacío
    if (!sku || sku.length < 3) {
      this.logger.warn(
        `SKU inválido o vacío: "${sku}". Generando uno basado en marca y modelo.`,
      );
      // Generar un SKU basado en marca y modelo como último recurso
      sku = this.generarSKU(productData.marca, productData.modelo);
    }

    // NO añadir prefijo para identificar la tienda - guardar solo el código tal cual
    // sku = `footlocker-${sku}`;  <-- Eliminamos esta línea

    this.logger.log(
      `SKU generado: ${sku} para producto ${productData.marca} ${productData.modelo}`,
    );

    // Normalizar marca - asegurarse de que sea siempre la marca completa
    // (ej: "New Balance", no solo "New")
    const marcaNormalizada = this.normalizarMarca(productData.marca);
    
    // Log detallado para verificar la extracción correcta de marca/modelo
    this.logger.log('='.repeat(80));
    this.logger.log('VERIFICACIÓN FINAL DE MARCA/MODELO:');
    this.logger.log(`Marca original extraída: "${productData.marca}"`);
    this.logger.log(`Marca normalizada: "${marcaNormalizada}"`);
    this.logger.log(`Modelo extraído (sin categoría): "${productData.modelo}"`);
    this.logger.log(`Categoría (NO usada para el modelo): "${productData.categoria || ''}"`);
    this.logger.log('='.repeat(80));

    // Solo procesar tallas REALES encontradas en la página
    const tallasFiltradas = (productData.tallas || []).filter(
      (t) => t && t.talla && t.talla.trim() !== '',
    ) as TallaScraped[];

    this.logger.log(
      `Se encontraron ${tallasFiltradas.length} tallas reales en la página para: ${productData.marca} ${productData.modelo}`,
    );

    // Alerta si no se encuentra ningún botón de talla
    if (tallasFiltradas.length === 0) {
      this.logger.warn(
        `ADVERTENCIA: No se encontraron tallas para el producto: ${productData.marca} ${productData.modelo} - URL: ${url}`,
      );
    }

    // Generar el objeto zapatilla - usando SOLO el modelo sin la categoría
    const zapatilla = {
      marca: marcaNormalizada,
      modelo: this.limpiarTexto(productData.modelo), // SOLO el modelo sin categoría
      sku: sku,
      imagen: productData.imagen,
      descripcion: this.limpiarTexto(productData.descripcion),
      precio: productData.precio,
      url_producto: url,
      tallas: tallasFiltradas,
      tienda_id: this.tiendaInfo.id,
      modelo_tienda: this.limpiarTexto(productData.modelo), // También sin categoría
      color: productData.color || '',
      fecha_scrape: new Date(),
    };

    // Log completo para depuración
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

    // Interactuar ocasionalmente con elementos de la página (imágenes de producto, tallas)
    try {
      // Intentar hacer hover en imágenes de producto
      const productImages = await this.page.$$(
        '.ProductImage img, .product-image img',
      );
      if (productImages.length > 0) {
        const randomImage =
          productImages[Math.floor(Math.random() * productImages.length)];
        await randomImage.hover();
        await this.esperaAleatoria(500, 1500);
      }

      // Intentar hacer hover en botones de talla (sin hacer clic)
      const sizeButtons = await this.page.$$('button[aria-label^="Size:"]');
      if (sizeButtons.length > 0) {
        const randomSize =
          sizeButtons[Math.floor(Math.random() * sizeButtons.length)];
        await randomSize.hover();
        await this.esperaAleatoria(300, 800);
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
      ];

      return captchaIndicators.some((indicator) =>
        pageContent.includes(indicator),
      );
    });
  }
}
