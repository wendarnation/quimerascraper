// src/scraper/tiendas/nigramercato-scraper.ts
import { Injectable } from '@nestjs/common';
import { BaseTiendaScraper } from './base-tienda-scraper';
import {
  ZapatillaScraped,
  TiendaInfo,
  TallaScraped,
} from '../interfaces/quimera-scraper.interface';

@Injectable()
export class NigramercatoScraper extends BaseTiendaScraper {
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
   * Método principal para raspar zapatillas de Nigramercato
   */
  async scrapeZapatillas(): Promise<ZapatillaScraped[]> {
    try {
      await this.initBrowser(this.getRandomUserAgent());

      // Basado en la captura de pantalla, URL de la categoría zapatillas
      const url = 'https://nigramercato.com/es/104-zapatillas';
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

      // Gestionar cookies si es necesario
      await this.handleCookieConsent();

      // Simular desplazamiento humano en la página
      await this.simulateHumanScrolling();

      // Basado en la segunda captura, los productos están en elementos con clase "col-xs-6 col-md-4 col-lg-3 px-0 col-list-products"
      const productListSelector = 'div[class*="col-list-products"]';
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

    // Basado en la segunda captura, los productos tienen enlaces en <a href="...">
    // dentro de div.thumbnail-container
    const productUrls = await this.page.evaluate((selector) => {
      // Función para obtener las URLs de productos visibles
      const getVisibleUrls = () => {
        // Buscar enlaces dentro de los divs de productos
        const productLinks = Array.from(
          document.querySelectorAll(`${selector} .thumbnail-container a`),
        );

        // Si no encuentra enlaces con ese selector, probar con una selección más general
        if (productLinks.length === 0) {
          return Array.from(document.querySelectorAll(`${selector} a`))
            .filter((element) => {
              // Verificar que el elemento es un HTMLAnchorElement y tiene href
              return (
                element instanceof HTMLAnchorElement &&
                element.href &&
                element.href.includes('nigramercato.com')
              );
            })
            .map((element) => (element as HTMLAnchorElement).href);
        }

        return productLinks.map((link) => (link as HTMLAnchorElement).href);
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

    // Esperar a que se cargue la información clave del producto
    try {
      // Basado en la imagen 4-6, estos son selectores para elementos clave del producto
      // Esperar a que cargue alguno de estos elementos
      await Promise.race([
        this.page.waitForSelector('.name_brand', { timeout: 10000 }),
        this.page.waitForSelector('.name_product', { timeout: 10000 }),
        this.page.waitForSelector('h1[class="name_product"]', { timeout: 10000 }),
      ]);
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

      // Basado en la cuarta imagen, la marca está en <p class="name_brand">Nike</p>
      const marca = getText('.name_brand');
      console.log(`Marca extraída: "${marca}"`);

      // Basado en la quinta imagen, el modelo está en <h1 class="name_product">NIKE W AIR MAX CRAZE</h1>
      const modeloCompleto = getText('.name_product');
      console.log(`Modelo completo extraído: "${modeloCompleto}"`);

      // Limpiar el modelo para quitar el nombre de la marca si aparece
      let modeloSinMarca = modeloCompleto;
      
      // Si el modelo comienza con el nombre de la marca, eliminarlo
      if (marca && modeloCompleto.toUpperCase().startsWith(marca.toUpperCase())) {
        modeloSinMarca = modeloCompleto.substring(marca.length).trim();
        console.log(`Modelo sin marca: "${modeloSinMarca}"`);
      }
      
      // Basado en la sexta imagen, el SKU está después de "SKU: "
      // <p>
      //  MODEL: NIKE W AIR MAX CRAZE
      //  <br>
      //  SKU: FZ2089-100
      //  <br>
      //  COLORWAY: WHITE/METALLIC GOLD-BLACK-COPPER MOON
      // </p>
      
      // Buscar el SKU en cualquier elemento que contenga "SKU:"
      let sku = '';
      const elements = document.querySelectorAll('p, div, span');
      for (const el of elements) {
        const text = el.textContent || '';
        if (text.includes('SKU:')) {
          const skuMatch = text.match(/SKU:\s*([A-Za-z0-9-]+)/);
          if (skuMatch && skuMatch[1]) {
            sku = skuMatch[1].trim();
            console.log(`SKU extraído: "${sku}"`);
            break;
          }
        }
      }
      
      // Extraer el color si está disponible (desde el mismo elemento que el SKU)
      let color = '';
      for (const el of elements) {
        const text = el.textContent || '';
        if (text.includes('COLORWAY:')) {
          const colorMatch = text.match(/COLORWAY:\s*(.*?)(?:\s*<br>|\s*$)/i);
          if (colorMatch && colorMatch[1]) {
            color = colorMatch[1].trim();
            console.log(`Color extraído: "${color}"`);
            break;
          }
        }
      }

      // Extraer el precio
      const precioText = getText('.new-product-content-price') || getText('.product-price');
      console.log(`Texto del precio extraído: "${precioText}"`);

      let precio = 0;
      if (precioText) {
        // Extraer números del texto del precio (asumiendo formato "100,00 €")
        const precioMatch = precioText.match(/(\d+(?:[,.]\d+)?)/);
        if (precioMatch) {
          precio = parseFloat(precioMatch[0].replace(',', '.'));
          console.log(`Precio procesado: ${precio}`);
        }
      }

      // Obtener la URL de la imagen
      let imagen = '';
      const imgElement = document.querySelector('.product-cover img') || 
                         document.querySelector('.img-fluid[alt*="zapatillas"]');
      
      if (imgElement) {
        imagen = imgElement.getAttribute('src') || '';
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
      const descripcion = getText('.product-description');
      
      // Extraer tallas disponibles
      // Buscar los selectores de tallas dentro de la página
      const tallasElements = document.querySelectorAll('select[name="group[2]"] option, .product-variants option, .talla-option');
      
      const tallas: { talla: string; disponible: boolean }[] = [];
      
      tallasElements.forEach((element) => {
        // El valor de la talla está en el texto del elemento
        const tallaTexto = element.textContent?.trim() || '';
        
        // Solo procesar elementos que tienen texto y no son la opción por defecto "Elige tu talla"
        if (tallaTexto && !tallaTexto.includes('Elige') && !tallaTexto.includes('Choose')) {
          // Limpiar el texto de la talla (puede incluir "- Agotado" u otras indicaciones)
          let talla = tallaTexto.replace(/\s*-\s*Agotado\s*$/i, '').trim();
          
          // Determinar si está disponible (no contiene "Agotado" y no tiene el atributo disabled)
          const disponible = !tallaTexto.toLowerCase().includes('agotado') && 
                             !element.hasAttribute('disabled');
                             
          tallas.push({
            talla,
            disponible
          });
          
          console.log(`Talla: "${talla}", Disponible: ${disponible}`);
        }
      });
      
      // Si no encontramos tallas en el selector, intentar buscar en spans o divs
      if (tallas.length === 0) {
        const tallaSpans = document.querySelectorAll('.variant-option, .talla-item');
        tallaSpans.forEach((span) => {
          const tallaTexto = span.textContent?.trim() || '';
          if (tallaTexto && !tallaTexto.includes('Elige')) {
            const talla = tallaTexto.replace(/\s*-\s*Agotado\s*$/i, '').trim();
            // Determinar disponibilidad por clases o atributos
            const disponible = !span.classList.contains('disabled') && 
                               !span.classList.contains('out-of-stock') &&
                               !tallaTexto.toLowerCase().includes('agotado');
            
            tallas.push({
              talla,
              disponible
            });
            
            console.log(`Talla alternativa: "${talla}", Disponible: ${disponible}`);
          }
        });
      }

      // Si aún no tenemos el SKU, intentar extraerlo de la URL
      if (!sku && pageUrl) {
        const urlPartes = pageUrl.split('/');
        const ultimaParte = urlPartes[urlPartes.length - 1];
        
        // Extraer código alfanumérico + guiones de la última parte de la URL
        const skuMatch = ultimaParte.match(/([A-Za-z0-9]+-[A-Za-z0-9]+)/);
        if (skuMatch && skuMatch[1]) {
          sku = skuMatch[1];
          console.log(`SKU extraído de URL: "${sku}"`);
        } else {
          // Verificar si el nombre de archivo tiene formato de SKU (antes de .html)
          const htmlMatch = ultimaParte.match(/([A-Za-z0-9-]+)\.html/);
          if (htmlMatch && htmlMatch[1]) {
            sku = htmlMatch[1];
            console.log(`SKU extraído de nombre de archivo: "${sku}"`);
          }
        }
      }
      
      // Formatear el modelo a Pascal Case (cada palabra con la primera letra mayúscula)
      const modeloFormateado = modeloSinMarca
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      
      console.log(`Modelo formateado (Pascal Case): "${modeloFormateado}"`);

      // Devolver los datos extraídos
      return {
        marca,
        modelo: modeloFormateado, // Modelo formateado en Pascal Case
        precio,
        imagen,
        descripcion,
        color,
        sku,
        tallas,
        modeloOriginal: modeloCompleto,
      };
    }, url);

    // Si no se pudo extraer un SKU de la página, generar uno basado en marca y modelo
    let sku = productData.sku;
    if (!sku || sku.length < 3) {
      this.logger.warn(
        `SKU inválido o vacío: "${sku}". Generando uno basado en marca y modelo.`,
      );
      // Generar un SKU basado en marca y modelo
      sku = this.generarSKU(productData.marca, productData.modelo);
    }

    // Normalizar marca
    const marcaNormalizada = this.normalizarMarca(productData.marca);
    
    // Filtrar tallas vacías
    const tallasFiltradas = (productData.tallas || []).filter(
      (t) => t && t.talla && t.talla.trim() !== '',
    ) as TallaScraped[];

    this.logger.log(
      `Se encontraron ${tallasFiltradas.length} tallas para: ${marcaNormalizada} ${productData.modelo}`,
    );

    // Generar el objeto zapatilla
    const zapatilla: ZapatillaScraped = {
      marca: marcaNormalizada,
      modelo: this.limpiarTexto(productData.modelo),
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
      // Buscar y cerrar el popup de newsletter (PopupSignupForm)
      await this.page.evaluate(() => {
        // Buscar elementos comunes de popups
        const popupSelectors = [
          '#PopupSignupForm_0',
          '.mc-modal',
          '.modal-container',
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
            const overlays = document.querySelectorAll('.mc-modal-bg, .modal-bg, .overlay, .modal-overlay');
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
      // En lugar de hover, solo identificamos las imágenes pero no hacemos hover
      const productImages = await this.page.$$('.product-cover img, .img-fluid');
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
