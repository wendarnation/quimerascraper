//       // Extraer el color si está presente en el modelo
//       // Los colores suelen estar al final del nombre del modelo después de un "-"
//       let color = '';
//       if (modeloSinMarca.includes('-')) {
//         const parts = modeloSinMarca.split('-');
//         // Si la última parte parece un color, extraerlo
//         const potentialColor = parts[parts.length - 1].trim();
//         if (
//           potentialColor.length > 0 &&
//           !/^\d+$/.test(potentialColor) // No es solo un número
//         ) {
//           color = potentialColor;
//           // Quitar el color del modelo
//           modeloSinMarca = parts.slice(0, -1).join('-').trim();
//         }
//       }

//       // Si no encontramos color en el nombre, buscar en la página
//       if (!color) {
//         const colorSelectors = [
//           '.product-color',
//           '.color-label',
//           'span[class*="color"]',
//           'div[data-test-id="color"]',
//           'meta[property*="color"]',
//           '*[itemprop="color"]'
//         ];

//         for (const selector of colorSelectors) {
//           let text = '';
//           if (selector.includes('meta')) {
//             text = getAttribute(selector, 'content');
//           } else {
//             text = getText(selector);
//           }

//           if (text && text.length > 0) {
//             color = text;
//             break;
//           }
//         }
//       }

//       // Si aún no encontramos color, buscar en scripts JSON-LD
//       if (!color) {
//         try {
//           const scripts = document.querySelectorAll('script[type="application/ld+json"]');
//           scripts.forEach(script => {
//             if (!color) {
//               try {
//                 const data = JSON.parse(script.textContent || '{}');
//                 if (data.color) {
//                   color = data.color;
//                 }
//               } catch (e) {
//                 // Ignorar errores de parsing
//               }
//             }
//           });
//         } catch (e) {
//           // Ignorar errores
//         }
//       }

//       console.log(`Color extraído: "${color}"`);

//       // Buscar el SKU (a menudo presente en la URL o en algún texto de la página)
//       let sku = '';

//       // Primero intentar extraer de la URL (como en las imágenes 1 y 3)
//       if (pageUrl) {
//         // La URL en la imagen 3 muestra: sivasdescalzo.com/es/p/zoom-field-jaxx-hq3072-400
//         // El SKU es la parte final: hq3072-400
//         const urlMatch = pageUrl.match(/\/(p|producto)\/([^\/]+?)(?:-([a-zA-Z0-9-]+))?(?:\/|\?|$)/);
//         if (urlMatch && urlMatch[3]) {
//           sku = urlMatch[3];
//         } else if (urlMatch && urlMatch[2]) {
//           // Si no hay una tercera parte capturada, usar la segunda (todo después de /p/)
//           const parts = urlMatch[2].split('-');
//           // Si las últimas partes tienen formato de SKU (alfanumérico con guiones)
//           if (parts.length >= 2) {
//             const lastTwoParts = parts.slice(-2).join('-');
//             if (/^[a-zA-Z0-9]+-[0-9]+$/.test(lastTwoParts)) {
//               sku = lastTwoParts;
//             }
//           }
//         }
//       }

//       // Si no se pudo extraer de la URL, buscar en la página
//       if (!sku) {
//         // Buscar textos que puedan contener el SKU
//         const elements = document.querySelectorAll('p, div, span, meta');
//         for (const el of elements) {
//           // Verificar atributos de contenido (para meta tags)
//           const content = el.getAttribute('content');
//           if (content && content.match(/[A-Z0-9]+-[0-9]+/)) {
//             const match = content.match(/([A-Z0-9]+-[0-9]+)/);
//             if (match) {
//               sku = match[1];
//               break;
//             }
//           }

//           // Verificar texto
//           const text = el.textContent || '';
//           if (
//             text.includes('SKU:') ||
//             text.includes('Referencia:') ||
//             text.includes('Ref:') ||
//             text.includes('Style:') ||
//             text.includes('Código:')
//           ) {
//             const skuMatch = text.match(/(?:SKU|Referencia|Ref|Style|Código)[:\s]+([A-Za-z0-9-]+)/i);
//             if (skuMatch && skuMatch[1]) {
//               sku = skuMatch[1].trim();
//               break;
//             }
//           }
//         }
//       }

//       // Buscar en scripts JSON-LD
//       if (!sku) {
//         try {
//           const scripts = document.querySelectorAll('script[type="application/ld+json"]');
//           scripts.forEach(script => {
//             if (!sku) {
//               try {
//                 const data = JSON.parse(script.textContent || '{}');
//                 if (data.sku) {
//                   sku = data.sku;
//                 } else if (data.productID) {
//                   sku = data.productID;
//                 } else if (data.mpn) {
//                   sku = data.mpn;
//                 }
//               } catch (e) {
//                 // Ignorar errores de parsing
//               }
//             }
//           });
//         } catch (e) {
//           // Ignorar errores
//         }
//       }

//       console.log(`SKU extraído: "${sku}"`);

//       // Extraer el precio
//       let precio = 0;

//       // Primero buscar en scripts JSON-LD (más confiable)
//       try {
//         const scripts = document.querySelectorAll('script[type="application/ld+json"]');
//         for (const script of scripts) {
//           try {
//             const jsonData = JSON.parse(script.textContent || '{}');
//             if (jsonData.offers && jsonData.offers.price) {
//               precio = parseFloat(jsonData.offers.price);
//               break;
//             } else if (jsonData.price) {
//               precio = parseFloat(jsonData.price);
//               break;
//             }
//           } catch (e) {
//             // Ignorar errores de parsing
//           }
//         }
//       } catch (e) {
//         // Ignorar errores
//       }

//       // Si no encontramos precio en JSON-LD, buscar en elementos DOM
//       if (precio === 0) {
//         // Buscar elementos con precio
//         const priceSelectors = [
//           '.product-price',
//           '.price',
//           'span[data-price-amount]',
//           '*[itemprop="price"]',
//           'meta[property="product:price:amount"]',
//           'meta[property="og:price:amount"]',
//           '*[class*="price"]'
//         ];

//         for (const selector of priceSelectors) {
//           let precioText = '';
//           if (selector.includes('meta')) {
//             precioText = getAttribute(selector, 'content');
//           } else {
//             const element = document.querySelector(selector);
//             if (element) {
//               // Primero intentar obtener del atributo content (para meta tags)
//               const content = element.getAttribute('content');
//               if (content) {
//                 precioText = content;
//               } else {
//                 precioText = element.textContent?.trim() || '';
//               }
//             }
//           }

//           // Intentar extraer un número
//           if (precioText) {
//             const precioMatch = precioText.match(/(\d+(?:[,.]\d+)?)/);
//             if (precioMatch) {
//               precio = parseFloat(precioMatch[0].replace(',', '.'));
//               console.log(`Precio extraído: ${precio} de "${precioText}"`);
//               break;
//             }
//           }
//         }
//       }

//       // Si todavía no tenemos precio, buscar más agresivamente en el texto
//       if (precio === 0) {
//         // Buscar cualquier texto que parezca un precio con símbolo de euro
//         const allElements = document.querySelectorAll('*');
//         for (const element of allElements) {
//           const text = element.textContent || '';
//           if (text.includes('€') || text.includes('EUR')) {
//             const priceMatch = text.match(/(\d+(?:[,.]\d+)?)\s*(?:€|EUR)/);
//             if (priceMatch) {
//               precio = parseFloat(priceMatch[1].replace(',', '.'));
//               break;
//             }
//           }
//         }
//       }

//       // Obtener la URL de la imagen
//       let imagen = '';

//       // Primero buscar en meta tags y scripts (más confiable)
//       const ogImage = getAttribute('meta[property="og:image"]', 'content');
//       if (ogImage) {
//         imagen = ogImage;
//       } else {
//         try {
//           const scripts = document.querySelectorAll('script[type="application/ld+json"]');
//           for (const script of scripts) {
//             try {
//               const jsonData = JSON.parse(script.textContent || '{}');
//               if (jsonData.image) {
//                 if (typeof jsonData.image === 'string') {
//                   imagen = jsonData.image;
//                   break;
//                 } else if (Array.isArray(jsonData.image) && jsonData.image.length > 0) {
//                   imagen = jsonData.image[0];
//                   break;
//                 } else if (jsonData.image.url) {
//                   imagen = jsonData.image.url;
//                   break;
//                 }
//               }
//             } catch (e) {
//               // Ignorar errores de parsing
//             }
//           }
//         } catch (e) {
//           // Ignorar errores
//         }
//       }

//       // Si no encontramos imagen, buscar en el DOM
//       if (!imagen) {
//         // Buscar imágenes del producto
//         const imgSelectors = [
//           '.product-cover img',
//           '.product-image img',
//           '.product-media img',
//           'img.v-full',
//           'img[itemprop="image"]',
//           'img[alt*="' + (modeloCompleto || 'zapatilla') + '"]',
//           'img[class*="product"]'
//         ];

//         for (const selector of imgSelectors) {
//           const element = document.querySelector(selector);
//           if (element) {
//             imagen = element.getAttribute('src') || '';

//             if (imagen) {
//               // Si la imagen es relativa, convertirla a absoluta
//               if (!imagen.startsWith('http')) {
//                 if (imagen.startsWith('/')) {
//                   const baseUrl = window.location.origin;
//                   imagen = baseUrl + imagen;
//                 } else {
//                   const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
//                   imagen = baseUrl + imagen;
//                 }
//               }
//               console.log(`URL de imagen extraída: "${imagen}"`);
//               break;
//             }
//           }
//         }
//       }

//       // Si no encontramos ninguna imagen, buscar en estilos de fondo
//       if (!imagen) {
//         const bgElements = document.querySelectorAll('[style*="background-image"]');
//         for (const element of bgElements) {
//           const style = element.getAttribute('style') || '';
//           const match = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/i);
//           if (match && match[1]) {
//             imagen = match[1];
//             // Si la imagen es relativa, convertirla a absoluta
//             if (!imagen.startsWith('http')) {
//               if (imagen.startsWith('/')) {
//                 const baseUrl = window.location.origin;
//                 imagen = baseUrl + imagen;
//               } else {
//                 const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
//                 imagen = baseUrl + imagen;
//               }
//             }
//             console.log(`URL de imagen extraída de background: "${imagen}"`);
//             break;
//           }
//         }
//       }

//       // Extraer descripción del producto si existe
//       let descripcion = '';

//       // Primero buscar en meta tags (más confiable)
//       descripcion = getAttribute('meta[name="description"]', 'content') ||
//                     getAttribute('meta[property="og:description"]', 'content');

//       // Si no encontramos descripción en meta tags, buscar en JSON-LD
//       if (!descripcion) {
//         try {
//           const scripts = document.querySelectorAll('script[type="application/ld+json"]');
//           for (const script of scripts) {
//             try {
//               const jsonData = JSON.parse(script.textContent || '{}');
//               if (jsonData.description) {
//                 descripcion = jsonData.description;
//                 break;
//               }
//             } catch (e) {
//               // Ignorar errores de parsing
//             }
//           }
//         } catch (e) {
//           // Ignorar errores
//         }
//       }

//       // Si aún no tenemos descripción, buscar en el DOM
//       if (!descripcion) {
//         const descSelectors = [
//           '.product-description',
//           'div[itemprop="description"]',
//           '.product-details',
//           '.product-info',
//           '*[class*="description"]',
//           'div[class*="product-details"]'
//         ];

//         for (const selector of descSelectors) {
//           const text = getText(selector);
//           if (text) {
//             descripcion = text;
//             console.log(`Descripción extraída: "${descripcion.substring(0, 50)}..."`);
//             break;
//           }
//         }
//       }

//       // Extraer tallas disponibles
//       const tallas: { talla: string; disponible: boolean }[] = [];

//       // Buscar selectores de tallas en la página
//       const sizeSelectors = [
//         'select[id*="size"] option',
//         'select[name*="size"] option',
//         'select[data-test*="size"] option',
//         '.size-options .option',
//         '.size-selector .size',
//         '.size-selector button',
//         '.size-picker button',
//         '.size-picker-container span',
//         'div[class*="sizeOption"]',
//         // Selectores adicionales para mayor robustez
//         '*[role="listitem"][aria-label*="size"]',
//         'button[aria-label*="size"]',
//         '*[class*="size"]',
//         'ul[data-testid*="size"] button',
//         'div[data-testid*="size"]'
//       ];

//       // Buscar tallas en diversos elementos
//       for (const selector of sizeSelectors) {
//         const elements = document.querySelectorAll(selector);
//         if (elements.length > 0) {
//           elements.forEach((element) => {
//             // El valor de la talla está en el texto del elemento o en un atributo
//             const tallaTexto = element.textContent?.trim() ||
//                               element.getAttribute('value') ||
//                               element.getAttribute('data-value') ||
//                               element.getAttribute('aria-label') || '';

//             // Solo procesar elementos que tienen texto y no son la opción por defecto
//             if (tallaTexto &&
//                 !tallaTexto.includes('Elige') &&
//                 !tallaTexto.includes('Choose') &&
//                 !tallaTexto.includes('Select')) {

//               // Limpiar el texto de la talla (eliminar indicaciones de agotado)
//               let talla = tallaTexto.replace(/\s*-\s*Agotado\s*$/i, '').trim();
//               talla = talla.replace(/\s*-\s*Out of stock\s*$/i, '').trim();
//               talla = talla.replace(/\s*-\s*Sold out\s*$/i, '').trim();
//               talla = talla.replace(/\s*\(Agotado\)\s*$/i, '').trim();

//               // Limpiar cualquier palabra o frase adicional, quedándonos solo con la talla
//               // Ejemplo: "Talla 42 - Última unidad" -> "42"
//               const sizeMatch = talla.match(/(?:^|\s)((?:US |UK |EU |)?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)\s*(?:[A-Z]+)?/i);
//               if (sizeMatch && sizeMatch[1]) {
//                 talla = sizeMatch[1].trim();
//               }

//               // Determinar si está disponible (no contiene textos de agotado y no tiene clases de deshabilitado)
//               const disponible = !tallaTexto.toLowerCase().includes('agotado') &&
//                                  !tallaTexto.toLowerCase().includes('out of stock') &&
//                                  !tallaTexto.toLowerCase().includes('sold out') &&
//                                  !element.classList.contains('disabled') &&
//                                  !element.classList.contains('out-of-stock') &&
//                                  !element.classList.contains('no-stock') &&
//                                  !element.hasAttribute('disabled');

//               // Evitar duplicados
//               if (!tallas.some(t => t.talla === talla)) {
//                 tallas.push({
//                   talla,
//                   disponible
//                 });

//                 console.log(`Talla: "${talla}", Disponible: ${disponible}`);
//               }
//             }
//           });

//           // Si encontramos tallas con este selector, no seguir buscando
//           if (tallas.length > 0) {
//             break;
//           }
//         }
//       }

//       // Si aún no tenemos tallas, buscar en el DOM de manera más genérica
//       if (tallas.length === 0) {
//         // Buscar cualquier elemento que pueda contener tallas
//         const potentialSizeElements = document.querySelectorAll('div, span, button, li');
//         const sizeRegex = /^(US |EU |UK |)?\d+(\.\d+)?(\/\d+(\.\d+)?)?(\s*[A-Z]+)?$/i; // Patrón para tallas típicas

//         potentialSizeElements.forEach((element) => {
//           const text = element.textContent?.trim() || '';

//           // Verificar si el texto parece una talla
//           if (sizeRegex.test(text) && text.length < 10) {
//             const isDisabled = element.classList.contains('disabled') ||
//                               element.classList.contains('out-of-stock') ||
//                               element.classList.contains('no-stock') ||
//                               element.hasAttribute('disabled');

//             // Evitar duplicados
//             if (!tallas.some(t => t.talla === text)) {
//               tallas.push({
//                 talla: text,
//                 disponible: !isDisabled
//               });

//               console.log(`Talla inferida: "${text}", Disponible: ${!isDisabled}`);
//             }
//           }
//         });
//       }

//       // Formatear el modelo a Pascal Case (cada palabra con la primera letra mayúscula)
//       const modeloFormateado = modeloSinMarca
//         .split(' ')
//         .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
//         .join(' ');

//       console.log(`Modelo formateado (Pascal Case): "${modeloFormateado}"`);

//       // Identificar el género si es posible
//       let genero = '';

//       // Buscar indicadores de género en el nombre del modelo o URL
//       if (modeloCompleto.includes(" W ") ||
//           modeloCompleto.includes(" Women") ||
//           modeloCompleto.includes("Mujer") ||
//           (pageUrl && pageUrl.toLowerCase().includes("/mujer/")) ||
//           (pageUrl && pageUrl.toLowerCase().includes("/women/"))) {
//         genero = "Mujer";
//       } else if (modeloCompleto.includes(" M ") ||
//                 modeloCompleto.includes(" Men") ||
//                 modeloCompleto.includes("Hombre") ||
//                 (pageUrl && pageUrl.toLowerCase().includes("/hombre/")) ||
//                 (pageUrl && pageUrl.toLowerCase().includes("/men/"))) {
//         genero = "Hombre";
//       } else if (modeloCompleto.includes(" GS ") ||
//                 modeloCompleto.includes(" PS ") ||
//                 modeloCompleto.includes(" TD ") ||
//                 modeloCompleto.includes(" Kid") ||
//                 modeloCompleto.includes("Niño") ||
//                 (pageUrl && pageUrl.toLowerCase().includes("/niño/")) ||
//                 (pageUrl && pageUrl.toLowerCase().includes("/kids/"))) {
//         genero = "Niño";
//       }

//       console.log(`Género inferido: "${genero}"`);

//       // Devolver los datos extraídos
//       return {
//         marca,
//         modelo: modeloFormateado,
//         precio,
//         imagen,
//         descripcion,
//         color,
//         sku,
//         tallas,
//         modeloOriginal: modeloCompleto,
//         genero
//       };
//     }, url);

//     // Si no se pudo extraer un SKU de la página, generar uno basado en marca y modelo
//     let sku = productData.sku;
//     if (!sku || sku.length < 3) {
//       this.logger.warn(
//         `SKU inválido o vacío: "${sku}". Generando uno basado en marca y modelo.`,
//       );
//       // Generar un SKU basado en marca y modelo
//       sku = this.generarSKU(productData.marca, productData.modelo);
//     }

//     // Normalizar marca
//     const marcaNormalizada = this.normalizarMarca(productData.marca);

//     // Filtrar tallas vacías
//     const tallasFiltradas = (productData.tallas || []).filter(
//       (t) => t && t.talla && t.talla.trim() !== '',
//     ) as TallaScraped[];

//     this.logger.log(
//       `Se encontraron ${tallasFiltradas.length} tallas para: ${marcaNormalizada} ${productData.modelo}`,
//     );

//     // Generar el objeto zapatilla
//     const zapatilla: ZapatillaScraped = {
//       marca: marcaNormalizada,
//       modelo: this.limpiarTexto(productData.modelo),
//       sku: sku,
//       imagen: productData.imagen,
//       descripcion: this.limpiarTexto(productData.descripcion),
//       precio: productData.precio,
//       url_producto: url,
//       tallas: tallasFiltradas,
//       tienda_id: this.tiendaInfo.id,
//       modelo_tienda: this.limpiarTexto(productData.modeloOriginal),
//       color: productData.color || '',
//       genero: productData.genero || '',
//       fecha_scrape: new Date(),
//     };

//     // Log para depuración
//     this.logger.log(
//       `Producto extraído: ${JSON.stringify({
//         sku: zapatilla.sku,
//         marca: zapatilla.marca,
//         modelo: zapatilla.modelo,
//         color: zapatilla.color,
//         tallas: zapatilla.tallas.length,
//         url: zapatilla.url_producto,
//       })}`,
//     );

//     return zapatilla;
//   }

//   /**
//    * Simula interacción humana con la página de producto
//    */
//   private async simulateHumanInteractionWithProduct(): Promise<void> {
//     // Esperar un tiempo aleatorio para simular lectura inicial
//     await this.esperaAleatoria(1000, 3000);

//     // Intentar cerrar cualquier popup que pueda interferir
//     try {
//       // Buscar y cerrar el popup de newsletter
//       await this.page.evaluate(() => {
//         // Buscar elementos comunes de popups
//         const popupSelectors = [
//           '#PopupSignupForm_0',
//           '.mc-modal',
//           '.modal-container',
//           '.newsletter-popup',
//           '#newsletter_popup',
//           '.popup-container'
//         ];

//         // Intentar ocultar cada posible popup
//         for (const selector of popupSelectors) {
//           const popupElement = document.querySelector(selector);
//           if (popupElement) {
//             console.log('Ocultando popup: ' + selector);
//             (popupElement as HTMLElement).style.display = 'none';
//             // También intentar eliminar cualquier overlay
//             const overlays = document.querySelectorAll('.mc-modal-bg, .modal-bg, .overlay, .modal-overlay');
//             overlays.forEach(el => {
//               (el as HTMLElement).style.display = 'none';
//             });
//           }
//         }
//       });

//       // Esperar brevemente después de intentar cerrar popups
//       await this.esperaAleatoria(300, 700);
//     } catch (error) {
//       this.logger.debug('Error al intentar cerrar popups', error);
//     }

//     // Simular movimientos realistas del ratón
//     await this.simulateRandomMouseMovements();

//     // Hacer scroll suave hacia abajo para ver la información del producto
//     await this.page.evaluate(() => {
//       const maxScroll = Math.min(document.body.scrollHeight, 1500);
//       const scrollSteps = Math.floor(Math.random() * 4) + 4; // Entre 4 y 7 pasos
//       const scrollDelay = Math.floor(Math.random() * 100) + 100; // Entre 100 y 200ms

//       return new Promise<void>((resolve) => {
//         let currentStep = 0;
//         const scrollInterval = setInterval(() => {
//           if (currentStep < scrollSteps) {
//             const nextPosition = (currentStep + 1) * (maxScroll / scrollSteps);
//             // Añadir pequeña variación al scroll
//             const variation = Math.random() * 50 - 25; // ±25px

//             window.scrollTo({
//               top: nextPosition + variation,
//               behavior: 'smooth',
//             });
//             currentStep++;
//           } else {
//             clearInterval(scrollInterval);
//             resolve();
//           }
//         }, scrollDelay);
//       });
//     });

//     // A veces, simular un clic en la imagen del producto
//     try {
//       const hasProductImage = await this.page.evaluate(() => {
//         const images = document.querySelectorAll('img[alt*="zapatilla"], img[alt*="sneaker"], img.product-image');
//         return images.length > 0;
//       });

//       if (hasProductImage && Math.random() > 0.5) {
//         await this.page.evaluate(() => {
//           const images = document.querySelectorAll('img[alt*="zapatilla"], img[alt*="sneaker"], img.product-image');
//           if (images.length > 0) {
//             const randomIndex = Math.floor(Math.random() * images.length);
//             const image = images[randomIndex] as HTMLElement;

//             // Solo hacer clic si la imagen es lo suficientemente grande
//             const rect = image.getBoundingClientRect();
//             if (rect.width > 100 && rect.height > 100) {
//               image.click();
//             }
//           }
//         });
//         await this.esperaAleatoria(500, 1500);
//       }
//     } catch (error) {
//       // Ignorar errores
//     }

//     // Volver a subir un poco la página
//     await this.page.evaluate(() => {
//       window.scrollTo({
//         top: window.scrollY - Math.floor(Math.random() * 300) - 100, // Entre 100 y 400px hacia arriba
//         behavior: 'smooth',
//       });
//     });

//     await this.esperaAleatoria(500, 1000);
//   }

//   /**
//    * Comprueba si la página contiene un CAPTCHA o mensaje anti-bot
//    */
//   private async checkForCaptcha(): Promise<boolean> {
//     return await this.page.evaluate(() => {
//       const pageContent = document.body.innerText.toLowerCase();
//       const captchaIndicators = [
//         'captcha',
//         'robot',
//         'verificar',
//         'verify you are human',
//         'verificar que eres humano',
//         'comprobar',
//         'verificación',
//         'verification',
//         'not a robot',
//         'no soy un robot',
//         'security check',
//         'comprobación de seguridad',
//         'access denied',
//         'forbidden',
//         'blocked',
//         'suspicious activity',
//         'actividad sospechosa',
//         'human verification',
//         'cloudflare',
//         'request blocked',
//         'unusual traffic',
//         'tráfico inusual'
//       ];

//       return captchaIndicators.some((indicator) =>
//         pageContent.includes(indicator),
//       );
//     });
//   }
// }
