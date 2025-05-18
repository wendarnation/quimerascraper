// src/scraper/tiendas/snipes-scraper.ts
import { Injectable } from '@nestjs/common';
import { BaseTiendaScraper } from './base-tienda-scraper';
import {
  ZapatillaScraped,
  TiendaInfo,
  TallaScraped,
} from '../interfaces/quimera-scraper.interface';

@Injectable()
export class SnipesScraper extends BaseTiendaScraper {
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
   * Método principal para raspar zapatillas de Snipes
   */
  async scrapeZapatillas(): Promise<ZapatillaScraped[]> {
    try {
      await this.initBrowser(this.getRandomUserAgent());

      // URL base de listado de zapatillas sneakers (basado en la primera imagen)
      const url = 'https://snipes.com/es-es/c/hombre/sneakers-199';
      this.logger.log(`Navegando a ${url}`);

      // Configurar evasión de fingerprinting
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
      // Basado en la séptima captura, vemos que los productos están en div con clase "card-container"
      const productListSelector = 'div.card-container';
      await this.page.waitForSelector(productListSelector, { timeout: 30000 });

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
      // Basado en patrones comunes de banners de cookies
      const cookieSelectors = [
        'button[data-testid="cookie-consent-accept-all"]',
        'button:has-text("Aceptar todas las cookies")',
        'button:has-text("Aceptar")',
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

    // Basado en la séptima captura, vemos que los enlaces de productos están en
    // a elementos dentro de card-container
    const productUrls = await this.page.evaluate((selector) => {
      // Función para obtener las URLs actualmente visibles
      const getVisibleUrls = () => {
        // Buscar enlaces dentro de los card-container
        const links = Array.from(
          document.querySelectorAll(`${selector} a[href*="/nike-air-force-"]`),
        );

        // Si no encuentra enlaces con ese selector específico, probar con una selección más general
        if (links.length === 0) {
          return Array.from(
            document.querySelectorAll(
              `${selector} a.image-container-desktop-image`,
            ),
          )
            .filter((element) => {
              // Verificar que el elemento es un HTMLAnchorElement y tiene href
              return (
                element instanceof HTMLAnchorElement &&
                element.href &&
                (element.href.includes('/p/') ||
                  element.href.includes('/nike-') ||
                  element.href.includes('/adidas-'))
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
    // Basado en las capturas 3 y 4, buscamos el contenedor principal del producto
    try {
      await this.page.waitForSelector('div.detail-left', { timeout: 30000 });
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
    // Basado en la imagen 5 y 6, necesitamos expandir los detalles para ver el SKU
    try {
      // Intentar hacer clic en detalles para expandir
      const detailsSelector = 'details.description';
      const detailsExists = await this.page.$(detailsSelector);
      if (detailsExists) {
        await this.page.click(detailsSelector);
        this.logger.log(
          'Hecho clic en el elemento details para acceder al SKU',
        );
        // Dar tiempo para que se expanda el contenido
        await this.esperaAleatoria(1000, 2000);
      }
    } catch (error) {
      this.logger.warn('No se pudo hacer clic en el elemento details:', error);
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
        document.querySelector('.detail-left')?.outerHTML ||
        document.body.innerHTML;
      console.log(htmlEstructura.substring(0, 500) + '...');

      // Extraer marca (basado en la imagen 3)
      // La marca está en un a con clase brand
      let marca = getText('div.brand a');
      console.log(`Marca extraída: "${marca}"`);

      // Extraer modelo (basado en la imagen 4)
      // El modelo está en h1 con clase product-name
      let modeloTextoCompleto = getText('h1.product-name');
      console.log(`Texto completo del modelo: "${modeloTextoCompleto}"`);

      // Limpiar el modelo: quitar la marca si está presente al principio
      let modeloSinMarca = modeloTextoCompleto;

      if (
        marca &&
        modeloTextoCompleto.toLowerCase().startsWith(marca.toLowerCase())
      ) {
        modeloSinMarca = modeloTextoCompleto.substring(marca.length).trim();
        console.log(`Marca eliminada del inicio: "${modeloSinMarca}"`);
      } else if (
        marca &&
        modeloTextoCompleto.toLowerCase().includes(marca.toLowerCase())
      ) {
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

      // Modelo final
      const modelo = modeloSinMarca.trim();
      console.log(`MODELO FINAL: "${modelo}"`);

      // Extraer precio
      let precio = 0;
      const precioText = getText('.promo-and-color');
      console.log('Texto del precio extraído:', precioText);

      if (precioText) {
        const precioMatch = precioText.match(/(\d+[.,]\d+)/);
        if (precioMatch) {
          precio = parseFloat(precioMatch[0].replace(',', '.'));
          console.log('Precio procesado:', precio);
        }
      }

      // Si no encontramos precio, buscar en otras áreas de la página
      if (precio === 0) {
        // Buscar cualquier elemento que pueda contener un precio
        const allPriceElements = document.querySelectorAll(
          '*[class*="price"], *[class*="Price"], *[class*="promo"]',
        );
        console.log(
          `Encontrados ${allPriceElements.length} elementos que podrían contener precio`,
        );

        for (const element of allPriceElements) {
          const text = element.textContent?.trim() || '';
          console.log(`Elemento posible precio: "${text}"`);

          const precioMatch = text.match(/(\d+[.,]\d+)(?:\s*€|\s*EUR)?/);
          if (precioMatch) {
            precio = parseFloat(precioMatch[0].replace(',', '.'));
            console.log('Precio encontrado en elemento alternativo:', precio);
            break;
          }
        }
      }

      // Obtener imagen principal
      let imagen = '';
      // Buscar imágenes que puedan ser la principal del producto
      const imgElement = document.querySelector(
        'img[alt*="Air Force"], img[alt*="zapatilla"], img.product-image',
      );

      if (imgElement) {
        imagen = imgElement.getAttribute('src') || '';
        console.log('URL de imagen extraída:', imagen);
      }

      // Si no se encuentra la imagen específica, buscar en todo el documento
      if (!imagen) {
        const allImages = document.querySelectorAll('img');
        console.log('Total de imágenes encontradas:', allImages.length);

        for (const img of allImages) {
          const src = img.getAttribute('src') || '';
          const alt = img.getAttribute('alt') || '';
          if (
            (src.includes('snipes.com') ||
              src.includes('image') ||
              src.includes('product')) &&
            !src.includes('icon') &&
            !src.includes('logo')
          ) {
            imagen = src;
            console.log('Imagen encontrada por búsqueda alternativa:', imagen);
            console.log('Alt de la imagen:', alt);
            break;
          }
        }
      }

      // Obtener descripción
      // Buscar en el elemento .product-description basado en la imagen 4
      const descripcion = getText('.product-description') || '';
      console.log(
        'Descripción extraída:',
        descripcion.substring(0, 50) + '...',
      );

      // Extraer tallas
      console.log('Buscando elementos de tallas...');

      // Buscar tallas en selectores basados en la estructura del sitio
      const tallaElements = document.querySelectorAll(
        '[data-attr-value], .swatch-size, button[title*="Talla"]',
      );
      console.log('Elementos con tallas encontrados:', tallaElements.length);

      const tallas = Array.from(tallaElements)
        .map((element) => {
          // Intentar obtener la talla del data-attr-value, title o del texto
          const tallaAtributo = element.getAttribute('data-attr-value') || '';
          const tallaTitle = element.getAttribute('title') || '';
          const tallaTexto = element.textContent?.trim() || '';

          let talla = '';

          // Primero intentar obtener de data-attr-value
          if (tallaAtributo && !isNaN(parseFloat(tallaAtributo))) {
            talla = tallaAtributo;
          }
          // Luego del title si contiene "Talla"
          else if (tallaTitle.includes('Talla')) {
            const match = tallaTitle.match(/Talla.*?(\d+(?:\.\d+)?)/i);
            if (match) {
              talla = match[1];
            }
          }
          // Finalmente del texto si parece una talla numérica
          else if (/^\d+(?:\.\d+)?$/.test(tallaTexto)) {
            talla = tallaTexto;
          }

          console.log(`Talla encontrada: ${talla}`);

          // Verificar disponibilidad
          const disabled = element.hasAttribute('disabled');
          const classNameIncludes =
            (element.className || '').includes('disabled') ||
            (element.className || '').includes('outOfStock') ||
            (element.className || '').includes('unavailable');

          const tallaNoDisponible =
            tallaTitle.toLowerCase().includes('agotada') ||
            tallaTitle.toLowerCase().includes('no disponible');

          const disponible =
            !disabled && !classNameIncludes && !tallaNoDisponible;

          return {
            talla,
            disponible,
          };
        })
        .filter((t) => t.talla); // Filtrar para eliminar tallas vacías

      // Extraer SKU (código de fábrica)
      // Basado en la imagen 6, el código está en dt/dd con el texto "Código de fábrica"
      console.log('Buscando SKU en los detalles del producto...');

      let sku = '';

      // Buscar todos los dt que puedan contener "Código"
      const allDtElements = document.querySelectorAll('dt');
      console.log(`Encontrados ${allDtElements.length} elementos dt`);

      for (const dt of allDtElements) {
        const dtText = dt.textContent?.trim() || '';
        console.log(`Texto dt: "${dtText}"`);

        if (
          dtText.includes('Código de fábrica') ||
          dtText.includes('Referencia') ||
          dtText.includes('SKU')
        ) {
          // Encontrado el dt que contiene "Código de fábrica"
          // El siguiente dd debe contener el valor del SKU
          const ddElement = dt.nextElementSibling;
          if (ddElement && ddElement.tagName === 'DD') {
            sku = ddElement.textContent?.trim() || '';
            console.log(`SKU encontrado: "${sku}"`);
            break;
          }
        }
      }

      // Si no se encontró con el método anterior, intentar con otro selector
      // específico de la imagen 6
      if (!sku) {
        const codigoFabricaElement = document.querySelector(
          'dt:contains("Código de fábrica") + dd',
        );
        if (codigoFabricaElement) {
          sku = codigoFabricaElement.textContent?.trim() || '';
          console.log(`SKU encontrado con selector alternativo: "${sku}"`);
        }
      }

      // Si todavía no hay SKU, buscar en cualquier parte del HTML donde pueda estar
      if (!sku) {
        const skuPattern =
          /(?:sku|código\s+de\s+fábrica|referencia|product\s+code)(?:\s*:\s*|\s*<\/dt>\s*<dd[^>]*>)([A-Za-z0-9-]+)/i;
        const htmlContent = document.body.innerHTML;
        const skuMatch = htmlContent.match(skuPattern);
        if (skuMatch && skuMatch[1]) {
          sku = skuMatch[1].trim();
          console.log(`SKU encontrado en el HTML: "${sku}"`);
        }
      }

      // Extraer color si está disponible
      let color = '';
      // Buscar color en elementos que puedan contenerlo
      const colorElements = document.querySelectorAll(
        '[data-attr="color"], [class*="color"], [class*="Color"]',
      );
      for (const element of colorElements) {
        const text = element.textContent?.trim() || '';
        if (text && text.length < 30) {
          // Un nombre de color no debería ser muy largo
          color = text;
          console.log(`Color encontrado: "${color}"`);
          break;
        }
      }

      // DEPURACIÓN: Imprimir toda la información extraída para verificación
      console.log('DATOS FINALES DEL PRODUCTO:');
      console.log(`- Marca: ${marca}`);
      console.log(`- Modelo: ${modelo}`);
      console.log(`- Precio: ${precio}`);
      console.log(`- Color: ${color}`);
      console.log(`- SKU: ${sku}`);
      console.log(
        `- Imagen: ${imagen ? imagen.substring(0, 50) + '...' : 'No disponible'}`,
      );
      console.log(`- Número de tallas encontradas: ${tallas.length}`);

      return {
        marca,
        modelo,
        precio,
        imagen,
        descripcion,
        color,
        sku,
        tallas,
      };
    }, url);

    // Si no se pudo extraer un SKU de la página, intentamos extraerlo de la URL
    let sku = productData.sku;

    // Si no hay SKU, extraerlo de la URL como último recurso
    if (!sku) {
      // Intentar extraer el SKU o ID de producto de la URL
      const skuFromUrlMatch = url.match(/\/([^\/]+)-(\d+)(?:\.html)?$/);
      if (skuFromUrlMatch && skuFromUrlMatch[2]) {
        sku = skuFromUrlMatch[2];
        this.logger.log(
          `No se encontró SKU en la página, usando URL como fallback: ${sku}`,
        );
      } else {
        // Si no se puede extraer directamente, usar la última parte de la URL
        const urlParts = url.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        sku = lastPart.replace('.html', '');
        this.logger.log(
          `No se encontró SKU estructurado en URL, usando última parte: ${sku}`,
        );
      }
    }

    // Asegurarnos que el SKU tiene un formato correcto y no está vacío
    if (!sku || sku.length < 3) {
      this.logger.warn(
        `SKU inválido o vacío: "${sku}". Generando uno basado en marca y modelo.`,
      );
      // Generar un SKU basado en marca y modelo como último recurso
      sku = this.generarSKU(productData.marca, productData.modelo);
    }

    this.logger.log(
      `SKU final: ${sku} para producto ${productData.marca} ${productData.modelo}`,
    );

    // Normalizar marca
    const marcaNormalizada = this.normalizarMarca(productData.marca);

    // Log detallado para verificar la extracción correcta de marca/modelo
    this.logger.log('='.repeat(80));
    this.logger.log('VERIFICACIÓN FINAL DE MARCA/MODELO:');
    this.logger.log(`Marca original extraída: "${productData.marca}"`);
    this.logger.log(`Marca normalizada: "${marcaNormalizada}"`);
    this.logger.log(`Modelo extraído: "${productData.modelo}"`);
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

    // Generar el objeto zapatilla
    const zapatilla = {
      marca: marcaNormalizada,
      modelo: this.limpiarTexto(productData.modelo),
      sku: sku,
      imagen: productData.imagen,
      descripcion: this.limpiarTexto(productData.descripcion),
      precio: productData.precio,
      url_producto: url,
      tallas: tallasFiltradas,
      tienda_id: this.tiendaInfo.id,
      modelo_tienda: this.limpiarTexto(productData.modelo),
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
        'img.product-image, img[alt*="zapatilla"]',
      );
      if (productImages.length > 0) {
        const randomImage =
          productImages[Math.floor(Math.random() * productImages.length)];
        await randomImage.hover();
        await this.esperaAleatoria(500, 1500);
      }

      // Intentar hacer hover en elementos de talla (sin hacer clic)
      const sizeElements = await this.page.$$(
        '[data-attr-value], .swatch-size',
      );
      if (sizeElements.length > 0) {
        const randomSize =
          sizeElements[Math.floor(Math.random() * sizeElements.length)];
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
