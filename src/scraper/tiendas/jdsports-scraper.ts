// src/scraper/tiendas/jdsports-scraper.ts
import { Injectable } from '@nestjs/common';
import { BaseTiendaScraper } from './base-tienda-scraper';
import {
  ZapatillaScraped,
  TiendaInfo,
  TallaScraped,
} from '../interfaces/quimera-scraper.interface';

@Injectable()
export class JdSportsScraper extends BaseTiendaScraper {
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
   * Método principal para raspar zapatillas de JD Sports
   */
  async scrapeZapatillas(): Promise<ZapatillaScraped[]> {
    try {
      await this.initBrowser(this.getRandomUserAgent());

      // URL basada en las imágenes proporcionadas: categoría de zapatillas de hombre
      const url =
        'https://www.jdsports.es/hombre/calzado-de-hombre/zapatillas/';
      this.logger.log(`Navegando a ${url}`);

      // Configurar evasion de fingerprinting
      await this.setupBrowserEvasion();

      // Navegar a la URL con opciones avanzadas de espera
      const response = await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      if (!response || response.status() >= 400) {
        throw new Error(
          `Error de navegación: ${response?.status()} - ${response?.statusText()}`,
        );
      }

      // Gestionar cookies - verificar si existe el banner antes de intentar cerrarlo
      await this.handleCookieConsent();

      // Simular desplazamiento humano en la página
      await this.simulateHumanScrolling();

      // Asegurar que la lista de productos está completamente cargada
      const productListSelector = '#productListMain li.productListItem';
      await this.page.waitForSelector(productListSelector, { timeout: 30000 });

      // Extraer URLs de los productos con el selector actualizado según la imagen proporcionada
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
      // Intentar diferentes selectores para el botón de aceptar cookies
      const cookieSelectors = [
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

    // Intentar extraer las URLs usando diferentes estrategias para manejar posible carga lazy
    const productUrls = await this.page.evaluate((selector) => {
      // Función para obtener las URLs actualmente visibles
      const getVisibleUrls = () => {
        const links = Array.from(
          document.querySelectorAll(`${selector} a[href*="/product/"]`),
        );

        // Si no encuentra enlaces con ese selector, probar con una selección más general
        // Reemplaza la parte problemática con esto
        if (links.length === 0) {
          return Array.from(document.querySelectorAll(`${selector} a`))
            .filter((element) => {
              // Verificar que el elemento es un HTMLAnchorElement y tiene href
              return (
                element instanceof HTMLAnchorElement &&
                element.href &&
                element.href.includes('/product/')
              );
            })
            .map((element) => (element as HTMLAnchorElement).href);
        }

        return links.map((link) => (link as HTMLAnchorElement).href);
      };

      return getVisibleUrls();
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

    // Esperar a que se cargue la información clave del producto con timeout generoso
    // Basado en la URL de producto proporcionada (blanco-nike-air-force-1-low)
    try {
      await this.page.waitForSelector('.productPage', { timeout: 30000 });
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

    // Extraer información del producto
    const productData = await this.page.evaluate(() => {
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
        document.querySelector('.productPage')?.outerHTML ||
        document.body.innerHTML;
      console.log(htmlEstructura.substring(0, 500) + '...');

      // Obtener marca y modelo directamente del título del producto
      // Siguiendo la estructura mostrada en la captura de pantalla
      const productTitle = getText('h1[itemprop="name"]') || 
                          getText('div.productItemTitle h1') ||
                          getText('#productItemTitle') || 
                          getText('.productItemTitle') ||
                          getText('h1.productName') || 
                          getText('.product-name');
      
      console.log('Título completo del producto:', productTitle);
      
      // Lista de marcas comunes para detectar automáticamente
      const marcasConocidas = [
        'Nike', 'Adidas', 'New Balance', 'Puma', 'Reebok', 'Converse', 
        'Vans', 'Jordan', 'Under Armour', 'Asics', 'Fila', 'Lacoste', 
        'The North Face', 'Columbia', 'Skechers', 'Timberland',
        'Tommy Hilfiger', 'Calvin Klein', 'Diesel', 'Levi\'s'
      ];
      
      // Intentar extraer la marca del título del producto
      let marca = '';
      let modeloCompleto = productTitle || '';
      
      // Buscar si alguna marca conocida aparece al inicio del título
      for (const marcaCandidata of marcasConocidas) {
        if (productTitle && productTitle.toLowerCase().startsWith(marcaCandidata.toLowerCase())) {
          marca = marcaCandidata;
          // Quitar la marca del inicio del modelo
          modeloCompleto = productTitle.substring(marcaCandidata.length).trim();
          console.log(`Marca detectada al inicio: ${marca}, Modelo: ${modeloCompleto}`);
          break;
        }
        // También buscar la marca en cualquier parte del título
        else if (productTitle && productTitle.toLowerCase().includes(marcaCandidata.toLowerCase())) {
          marca = marcaCandidata;
          // No quitamos la marca del modelo en este caso para no fragmentar el nombre
          console.log(`Marca detectada en el título: ${marca}`);
          break;
        }
      }
      
      // Si no se detecta ninguna marca conocida, intentar extraer la primera palabra como marca
      if (!marca && productTitle) {
        const primeraPalabra = productTitle.split(' ')[0];
        if (primeraPalabra && primeraPalabra.length > 1) {
          marca = primeraPalabra;
          modeloCompleto = productTitle.substring(primeraPalabra.length).trim();
          console.log(`Marca extraída de primera palabra: ${marca}, Modelo: ${modeloCompleto}`);
        }
      }
      
      // Si aún así no hay marca, buscar en otros elementos de la página
      if (!marca) {
        marca = getText('.brandName') || 
               getText('.brand-name') || 
               getText('[data-e2e="product-brand-name"]') || 
               'Desconocida';
               
        console.log(`Marca extraída de elementos secundarios: ${marca}`);
      }
      
      // Obtener precio - intentar diferentes selectores comunes
      let precioText =
        getText('.productPrice .now') ||
        getText('.product-price .now') ||
        getText('[data-e2e="product-price"]') ||
        getText('.price-now') ||
        getText('.product-price');

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

      // Obtener imagen principal - intentar diferentes selectores
      let imagen =
        getAttribute('.owl-item.active img', 'src') ||
        getAttribute('.mainImage img', 'src') ||
        getAttribute('.product-image img', 'src') ||
        getAttribute('[data-e2e="product-image"] img', 'src') ||
        getAttribute('.gallery-image--featured img', 'src');

      console.log('URL de imagen extraída:', imagen);

      // Si no se encuentra la imagen, buscar en todo el documento
      if (!imagen) {
        const allImages = document.querySelectorAll('img');
        console.log('Total de imágenes encontradas:', allImages.length);

        for (const img of allImages) {
          const src = img.getAttribute('src') || '';
          if (
            src.includes('product') &&
            !src.includes('icon') &&
            !src.includes('logo')
          ) {
            imagen = src;
            console.log('Imagen encontrada por búsqueda alternativa:', imagen);
            break;
          }
        }
      }

      // Obtener descripción con diferentes selectores posibles
      const descripcion =
        getText('ul .acitem li') ||
        getText('.product-description') ||
        getText('[data-e2e="product-description"]') ||
        getText('.description-content');

      console.log(
        'Descripción extraida (primeros 50 caracteres):',
        descripcion.substring(0, 50) + '...',
      );

      // Extraer tallas directamente de los botones con data-size
      console.log('Buscando botones de tallas con atributo data-size...');
      const botonesConDataSize = document.querySelectorAll('button[data-size]');
      console.log('Botones con data-size encontrados:', botonesConDataSize.length);
      
      // Buscar el product-code que se muestra en la captura de pantalla
      // En la imagen se ve que está en un span con class="product-code"
      // Dentro de un <div> con class="tab-delivery" o dentro de un elemento con class="tab-row"
      console.log('Buscando product-code en selectores específicos según la captura...');
      
      // Buscar directamente el elemento con la clase 'product-code' como se ve en la imagen
      let productCodeElement = document.querySelector('span.product-code');
      
      if (productCodeElement) {
        console.log('Elemento span.product-code encontrado:', productCodeElement.textContent);
      } else {
        // Buscar dentro de tab-row como se ve en la imagen
        console.log('Buscando product-code en .tab-row...');
        const tabRowElement = document.querySelector('.tab-row');
        if (tabRowElement) {
          console.log('Contenido de .tab-row:', tabRowElement.textContent);
          // Intentar encontrar algo con formato de código de producto
          if (tabRowElement.textContent) {
            const matchText = tabRowElement.textContent;
            const match = matchText.match(/Código de producto:\s*([A-Za-z0-9]+)/);
            if (match && match[1]) {
              console.log('Código de producto encontrado en .tab-row:', match[1]);
            }
          }
        }
        
        // También buscar en otros lugares donde podría estar el código
        console.log('Buscando product-code en otros selectores alternativos...');
        
        // Basado en la imagen, parece que está dentro de un span con class="product-code"
        // En el texto "Código de producto: 126767_jdsports/030664"
        // O también podría ser solo "126767_jdsports/030664"
        
        // Buscar cualquier elemento que contenga texto similar a "Código de producto:" o un patrón como "XXXXXX_jdsports/XXXXXX"
        const allTextElements = document.querySelectorAll('div, span, p');
        for (const element of allTextElements) {
          const text = element.textContent || '';
          if (text.includes('Código de producto:') || 
              text.includes('product-code') || 
              text.match(/\d+_jdsports\/\d+/)) {
            console.log('Posible elemento con código de producto:', text);
          }
        }
      }

      // Extraer tallas de los botones con data-size
      const tallas = Array.from(botonesConDataSize).map((el) => {
        // Obtener el valor de la talla directamente del atributo data-size
        const tallaValue = el.getAttribute('data-size') || '';
        
        // En JD Sports, data-stockcheckeravailable="0" significa disponible (IMPORTANTE)
        // Si hay alguna confusión sobre el significado, lo sacamos de los botones reales en la página
        const stockAvailable = el.getAttribute('data-stockcheckeravailable');
        
        // data-stockcheckeravailable === "0" significa que está disponible
        const disponible = stockAvailable === '0';
        
        console.log(`Talla data-size: ${tallaValue}, Disponible: ${disponible}, stockValue: ${stockAvailable}`);

        return {
          talla: tallaValue,
          disponible: disponible,
        };
      });

      // IMPORTANTE: Solo extraer tallas que realmente existen en la página - sin generar tallas ficticias
      // Si no se encontraron tallas con data-size, intentar con un selector alternativo
      if (tallas.length === 0) {
        console.log('No se encontraron tallas con data-size, probando selectores alternativos...');
        
        // Intentar con diferentes botones que puedan tener información de tallas
        const botonesTallasAlternativos = document.querySelectorAll(
          'button[data-ele="pdp-productDetails-size"], button[class*="sizeButton"], button[class*="sizeOptions"]'
        );
        
        console.log('Botones alternativos encontrados:', botonesTallasAlternativos.length);
        
        if (botonesTallasAlternativos.length > 0) {
          // Extraer tallas de los botones alternativos
          return {
            marca,
            modelo: modeloCompleto || productTitle || 'Modelo desconocido',
            precio,
            imagen,
            descripcion,
            tallas: Array.from(botonesTallasAlternativos).map(el => ({
              talla: el.getAttribute('data-size') || el.textContent?.trim() || '',
              disponible: el.getAttribute('data-stockcheckeravailable') === '0'
            })).filter(t => t.talla),
          };
        }
        
        // Si no se encuentra nada, devolver array vacío de tallas
        console.log('No se encontraron tallas en la página, devolviendo array vacío');
        return {
          marca,
          modelo: modeloCompleto || productTitle || 'Modelo desconocido',
          precio,
          imagen,
          descripcion,
          tallas: [] // Array vacío, sin tallas predeterminadas
        };
      }

      // DEPURACIÓN: Imprimir toda la información extraída para verificación
      console.log('DATOS FINALES DEL PRODUCTO:');
      console.log(`- Marca: ${marca}`);
      console.log(`- Modelo: ${modeloCompleto || productTitle || 'Modelo desconocido'}`);
      console.log(`- Precio: ${precio}`);
      console.log(`- Imagen: ${imagen ? imagen.substring(0, 50) + '...' : 'No disponible'}`);
      console.log(`- Número de tallas encontradas: ${tallas.length}`);

      return {
        marca,
        modelo: modeloCompleto || productTitle || 'Modelo desconocido',
        precio,
        imagen,
        descripcion,
        tallas,
      };
    });

    // Extraer el product-code directamente de la página
    // Basado en la captura de pantalla, vemos que el código está en un elemento con clase "product-code"
    // Dentro de la captura se ve como "Código de producto: 126767_jdsports/030664"
    const productCode = await this.page.evaluate(() => {
      // En la imagen se ve claramente que debemos buscar un elemento con clase "product-code"
      // o buscar en el documento el texto que tenga formato "Código de producto: XXXXX"
      
      // Buscar primero con la estructura exacta de la imagen: una etiqueta span con clase product-code
      let codeFromSpan = '';
      const productCodeElement = document.querySelector('span.product-code');
      if (productCodeElement && productCodeElement.textContent) {
        console.log('Encontrado elemento span.product-code:', productCodeElement.textContent);
        codeFromSpan = productCodeElement.textContent.trim();
      }
      
      // Si contiene "Código de producto: XXXX", extraer solo XXXX
      if (codeFromSpan.includes('Código de producto:')) {
        const match = codeFromSpan.match(/Código de producto:\s*([A-Za-z0-9\/._-]+)/);
        if (match && match[1]) {
          console.log('Código extraído de span.product-code:', match[1]);
          return match[1].trim();
        }
      }
      
      // Si el span no tiene el formato esperado pero contiene texto, podemos usarlo directamente
      if (codeFromSpan) {
        return codeFromSpan;
      }
      
      // Si no encontramos el span, buscamos en tab-row que también aparece en la imagen
      const tabRowElement = document.querySelector('.tab-row');
      if (tabRowElement) {
        // Usar una variable temporal y asegurar que nunca es null
        const textContent = tabRowElement.textContent || '';
        // No usar la propiedad textContent directamente, usar nuestra variable segura
        // Buscar patrón "Código de producto: XXXXX"
        const match = textContent.match(/Código de producto:\s*([A-Za-z0-9\/._-]+)/);
        if (match && match[1]) {
          console.log('Código extraído de .tab-row:', match[1]);
          return match[1].trim();
        }
      }
      
      // Como última opción, buscar cualquier texto en el documento que coincida con el patrón
      const allText = document.body.textContent || '';
      const codePattern = /Código de producto:\s*([A-Za-z0-9\/._-]+)/;
      const matchInBody = allText.match(codePattern);
      if (matchInBody && matchInBody[1]) {
        console.log('Código encontrado en el texto del documento:', matchInBody[1]);
        return matchInBody[1].trim();
      }
      
      return null;
    });

    let sku;
    if (productCode) {
      // Si encontramos el product-code, usarlo como parte del SKU
      // Sanitizar el SKU para evitar caracteres especiales como / que puedan causar problemas en la URL
      const safeProductCode = productCode.replace(/[\/]/g, '-');
      sku = `jdsports-${safeProductCode}`;
      this.logger.log(`SKU generado usando product-code (sanitizado): ${sku}`);
    } else {
      // Como fallback, extraer el ID del producto de la URL
      const urlParts = url.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      sku = `jdsports-${lastPart}`;
      this.logger.log(`No se encontró product-code, usando URL como fallback para SKU: ${sku}`);
    }
    
    this.logger.log(`SKU generado: ${sku} para producto ${productData.marca} ${productData.modelo}`);
    
    // Asegurar un modelo único para cada zapatilla añadiendo categoría y SKU
    let modeloUnico = productData.modelo;
    
    // Añadir info de categoría (hombre/mujer/niño) al modelo si no la contiene
    if (!modeloUnico.toLowerCase().includes('mujer') && 
        !modeloUnico.toLowerCase().includes('hombre') && 
        !modeloUnico.toLowerCase().includes('niño')) {
      if (url.toLowerCase().includes('/mujer/')) {
        modeloUnico += ' para mujer';
      } else if (url.toLowerCase().includes('/hombre/')) {
        modeloUnico += ' para hombre';
      } else if (url.toLowerCase().includes('/ninos/') || url.toLowerCase().includes('/niños/')) {
        modeloUnico += ' para niño';
      }
    }
    
    // Añadir SKU al final del modelo para garantizar unicidad absoluta
    modeloUnico = `${modeloUnico} - ${sku}`;
    
    this.logger.log(`Modelo único generado: ${modeloUnico}`);
    
    // Normalizar marca
    const marcaNormalizada = this.normalizarMarca(productData.marca);

    // Solo procesar tallas REALES encontradas en la página (no tallas predeterminadas)
    const tallasFiltradas = (productData.tallas || []).filter(
    (t) => t && t.talla && t.talla.trim() !== '',
    ) as TallaScraped[];

      this.logger.log(`Se encontraron ${tallasFiltradas.length} tallas reales en la página para: ${productData.marca} ${productData.modelo}`);
      
      // Alerta si no se encuentra ningún botón de talla
      if (tallasFiltradas.length === 0) {
        this.logger.warn(`ADVERTENCIA: No se encontraron tallas para el producto: ${productData.marca} ${productData.modelo} - URL: ${url}`);
      }

    // ADVERTENCIA: Importante que se respete la disponibilidad real
      this.logger.log('Advertencia: La disponibilidad de las tallas debe respetarse tal como se indica en este scraper.');
      this.logger.log('La disponibilidad de las tallas se basa en data-stockcheckeravailable="0" = disponible, "1" = no disponible.');
      this.logger.log('Por favor, asegúrese de que no se están forzando todas las tallas a disponible=true en el ApiService.');

      // ADVERTENCIA IMPORTANTE: La API está forzando todas las tallas a disponible=true
      // Esto puede causar que zapatillas sin stock aparezcan como disponibles
      this.logger.warn('ADVERTENCIA: El ApiService está forzando todas las tallas a disponible=true');
      this.logger.warn('Esto puede causar que zapatillas sin stock aparezcan como disponibles');
      this.logger.warn('Para corregirlo, modificar el ApiService para respetar la disponibilidad original');
      
      // IMPORTANTE: Solo usar las tallas realmente encontradas en la página - no generar tallas predeterminadas o ficticias
    // Las tallas reales encontradas en JD Sports y su disponibilidad
      if (tallasFiltradas.length > 0) {
        this.logger.log('Detalle de tallas encontradas:');
        tallasFiltradas.forEach((t, i) => {
          this.logger.log(`- Talla ${i+1}: "${t.talla}", Disponible: ${t.disponible}`);
        });
      }

      // Validar que tenemos un SKU único
    if (!sku) {
      this.logger.warn('SKU no generado correctamente para:', url);
      throw new Error('No se pudo generar un SKU válido para el producto');
    }

    // Generar y validar el objeto zapatilla
    // Eliminar esta sección duplicada ya que ya tenemos la validación y filtrado de tallas arriba

    const zapatilla = {
      marca: marcaNormalizada,
      modelo: this.limpiarTexto(modeloUnico), // Usar el modelo único generado
      sku: sku, // SKU basado en el ID del producto o URL hash
      imagen: productData.imagen,
      descripcion: this.limpiarTexto(productData.descripcion),
      precio: productData.precio,
      url_producto: url,
      tallas: tallasFiltradas,
      tienda_id: this.tiendaInfo.id,
      modelo_tienda: this.limpiarTexto(productData.modelo),  // Guardamos el modelo original como modelo_tienda
      fecha_scrape: new Date(),
    };

    // Log completo para depuración
    this.logger.log(`Producto extraído: ${JSON.stringify({
      sku: zapatilla.sku,
      marca: zapatilla.marca,
      modelo: zapatilla.modelo,
      tallas: zapatilla.tallas.length,
      url: zapatilla.url_producto
    })}`);

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
        '.productImageContainer img, .product-image img',
      );
      if (productImages.length > 0) {
        const randomImage =
          productImages[Math.floor(Math.random() * productImages.length)];
        await randomImage.hover();
        await this.esperaAleatoria(500, 1500);
      }

      // Intentar hacer hover en botones de talla (sin hacer clic)
      const sizeButtons = await this.page.$$(
        '.sizeButtons button, [data-e2e="size-selector"] button',
      );
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
   * Genera un hash a partir de un string (URL) para crear SKUs únicos
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a entero de 32 bits
    }
    // Convertir a positivo y limitar a 8 caracteres
    return Math.abs(hash).toString().substring(0, 8);
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
