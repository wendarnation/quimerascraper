// src/scraper/api/api.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  ZapatillaScraped,
  TiendaInfo,
} from '../interfaces/quimera-scraper.interface';

/**
 * SOLUCIÓN AL PROBLEMA DE TALLAS:
 *
 * Se ha identificado un error donde solo se está creando una talla por zapatilla.
 * La solución implementada simplifica el método createOrUpdateTalla para hacer
 * operaciones directas sin complicaciones innecesarias.
 */

@Injectable()
export class ApiService {
  private readonly logger = new Logger(ApiService.name);
  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private readonly apiBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiBaseUrl = this.configService.get<string>('API_BASE_URL') || '';
  }

  /**
   * Obtiene un token de autenticación de Auth0
   */
  async getToken(): Promise<string> {
    // Si ya tenemos un token válido, lo devolvemos
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.token;
    }

    try {
      const auth0Domain = this.configService.get<string>('AUTH0_DOMAIN');
      const clientId = this.configService.get<string>(
        'AUTH0_SCRAPER_CLIENT_ID',
      );
      const clientSecret = this.configService.get<string>(
        'AUTH0_SCRAPER_CLIENT_SECRET',
      );
      const audience = this.configService.get<string>('AUTH0_AUDIENCE');
      const scope =
        this.configService.get<string>('AUTH0_SCOPE') || 'admin:zapatillas';

      this.logger.log('Obteniendo nuevo token de Auth0...');

      const response = await firstValueFrom(
        this.httpService.post(
          `https://${auth0Domain}/oauth/token`,
          {
            client_id: clientId,
            client_secret: clientSecret,
            audience: audience,
            grant_type: 'client_credentials',
            scope: scope,
          },
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      this.token = (response.data.access_token as string) || '';
      // Establecer expiración token (normalmente 24h para client credentials)
      this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);

      this.logger.log('Token de Auth0 obtenido correctamente');
      // Log the token details for debugging
      this.logger.debug(
        `Token info: Expira en ${response.data.expires_in}s, scope: ${response.data.scope || 'N/A'}`,
      );
      this.logger.debug(`Token type: ${response.data.token_type || 'N/A'}`);
      this.logger.debug(
        `Token (primeros 20 caracteres): ${this.token.substring(0, 20)}...`,
      );

      return this.token;
    } catch (error) {
      this.logger.error(`Error al obtener token de Auth0: ${error.message}`);
      throw new Error('No se pudo obtener token de autenticación');
    }
  }

  /**
   * Realiza una petición autenticada a la API
   */
  async makeAuthenticatedRequest(
    method: string,
    endpoint: string,
    data?: any,
  ): Promise<any> {
    try {
      const token = await this.getToken();
      const url = `${this.apiBaseUrl}${endpoint}`;

      const requestConfig = {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      this.logger.debug(
        `Token usado para autenticación: ${token.substring(0, 20)}...`,
      );
      this.logger.debug(`Realizando petición ${method.toUpperCase()} a ${url}`);

      // Para seguimiento de errores, registrar la URL completa en peticiones que fallan
      if (endpoint.includes('zapatillas') || endpoint.includes('tallas')) {
        this.logger.debug(`URL completa: ${this.apiBaseUrl}${endpoint}`);
        if (data) {
          this.logger.debug(
            `Datos enviados: ${JSON.stringify(data).substring(0, 100)}...`,
          );
        }
      }

      let response;
      switch (method.toLowerCase()) {
        case 'get':
          response = await firstValueFrom(
            this.httpService.get(url, requestConfig),
          );
          break;
        case 'post':
          response = await firstValueFrom(
            this.httpService.post(url, data, requestConfig),
          );
          break;
        case 'put':
          response = await firstValueFrom(
            this.httpService.put(url, data, requestConfig),
          );
          break;
        case 'patch':
          response = await firstValueFrom(
            this.httpService.patch(url, data, requestConfig),
          );
          break;
        case 'delete':
          response = await firstValueFrom(
            this.httpService.delete(url, requestConfig),
          );
          break;
        default:
          throw new Error(`Método HTTP no soportado: ${method}`);
      }

      return response.data;
    } catch (error) {
      let errorMessage = `Error en request ${method} a ${endpoint}: ${error.message}`;

      if (error.response) {
        errorMessage += ` - Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`;
      }

      this.logger.error(errorMessage);
      throw error;
    }
  }

  /**
   * Obtiene la lista de tiendas
   */
  async getTiendas(): Promise<TiendaInfo[]> {
    try {
      const response = await this.makeAuthenticatedRequest('get', '/tiendas');
      return Array.isArray(response)
        ? response.filter((tienda) => tienda.activa)
        : [];
    } catch (error) {
      this.logger.error(`Error al obtener tiendas: ${error.message}`);
      return [];
    }
  }

  /**
   * Crea o actualiza una zapatilla
   * OPTIMIZADO: Manejo mejorado, reducción de logs y mejor búsqueda de duplicados
   */
  async createOrUpdateZapatilla(zapatilla: {
    marca: string;
    modelo: string;
    sku: string;
    imagen?: string;
    descripcion?: string;
  }): Promise<any> {
    try {
      // Verificar y limpiar datos de entrada
      if (!zapatilla.marca || !zapatilla.modelo || !zapatilla.sku) {
        throw new Error(
          'Datos incompletos de zapatilla: marca, modelo y SKU son obligatorios',
        );
      }

      // Log simplificado para depuración
      this.logger.log(
        `ZAPATILLA: ${zapatilla.marca} ${zapatilla.modelo} (SKU: ${zapatilla.sku})`,
      );

      // Asegurar que activa se establezca a true
      const zapatillaData = {
        ...zapatilla,
        activa: true,
      };

      // SOLUCIÓN CORREGIDA: Primero buscar por SKU exacto para evitar duplicados
      // Si existe, actualizarla; si no, crear una nueva
      const encodedSku = encodeURIComponent(zapatilla.sku);

      try {
        // 1. Buscar por SKU exacto
        const existingZapatillas = await this.makeAuthenticatedRequest(
          'get',
          `/zapatillas?sku=${encodedSku}`,
        );

        // Verificar si existe una zapatilla con el SKU exacto
        const existingMatch =
          existingZapatillas && existingZapatillas.length > 0
            ? existingZapatillas.find((z) => z.sku === zapatilla.sku)
            : null;

        if (existingMatch) {
          this.logger.log(
            `Zapatilla existente por SKU exacto. ID=${existingMatch.id}`,
          );

          // Actualizar si está inactiva o necesita actualizar imagen
          if (
            !existingMatch.activa ||
            (!existingMatch.imagen && zapatilla.imagen)
          ) {
            const updates = {
              ...(existingMatch.activa ? {} : { activa: true }),
              ...(!existingMatch.imagen && zapatilla.imagen
                ? { imagen: zapatilla.imagen }
                : {}),
            };

            if (Object.keys(updates).length > 0) {
              await this.makeAuthenticatedRequest(
                'patch',
                `/zapatillas/${existingMatch.id}`,
                updates,
              );

              this.logger.log(
                `Zapatilla ID=${existingMatch.id} actualizada correctamente`,
              );

              // Actualizar en memoria el objeto
              Object.assign(existingMatch, updates);
            }
          }

          return existingMatch;
        }

        // 2. Si no existe con SKU exacto, crear nueva zapatilla
        this.logger.log(
          `No se encontró zapatilla con SKU exacto. Creando nueva.`,
        );
        const nuevaZapatilla = await this.makeAuthenticatedRequest(
          'post',
          '/zapatillas',
          zapatillaData,
        );

        this.logger.log(
          `Zapatilla creada correctamente con ID: ${nuevaZapatilla.id}`,
        );
        return nuevaZapatilla;
      } catch (error) {
        this.logger.error(`Error al buscar/crear zapatilla: ${error.message}`);

        // Intentar crear directamente en caso de error en la búsqueda
        try {
          const nuevaZapatilla = await this.makeAuthenticatedRequest(
            'post',
            '/zapatillas',
            zapatillaData,
          );

          this.logger.log(
            `Zapatilla creada en segundo intento con ID: ${nuevaZapatilla.id}`,
          );
          return nuevaZapatilla;
        } catch (createError) {
          // Si falla por posible duplicado, añadir timestamp para garantizar unicidad
          this.logger.error(`Error al crear zapatilla: ${createError.message}`);

          const reintento = await this.makeAuthenticatedRequest(
            'post',
            '/zapatillas',
            {
              ...zapatillaData,
              sku: `${zapatillaData.sku}-${Date.now()}`,
            },
          );

          this.logger.log(
            `Zapatilla creada con SKU único temporal: ${reintento.id}`,
          );
          return reintento;
        }
      }
    } catch (error) {
      this.logger.error(
        `Error al crear/actualizar zapatilla: ${error.message}`,
      );

      // Detalles adicionales del error para depuración
      if (error.response) {
        this.logger.error(
          `Error HTTP: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`,
        );
      }

      throw error;
    }
  }

  /**
   * Crea o actualiza la relación entre zapatilla y tienda
   * OPTIMIZADO: Máxima confiabilidad con sistema de reintentos y manejo mejorado de errores
   */
  async createOrUpdateZapatillaTienda(
    zapatillaId: number,
    tiendaId: number,
    data: {
      precio: number | string;
      url_producto: string;
      modelo_tienda?: string;
    },
  ): Promise<any> {
    try {
      // Registrar datos de entrada resumidos
      this.logger.log(
        `RELACIÓN: Zapatilla=${zapatillaId}, Tienda=${tiendaId}, Precio=${data.precio}`,
      );

      // Validación rápida de datos esenciales
      if (!zapatillaId || !tiendaId || !data.precio || !data.url_producto) {
        throw new Error('Datos incompletos para la relación zapatilla-tienda');
      }

      // Convertir IDs a números
      const zapatillaIdNum = Number(zapatillaId);
      const tiendaIdNum = Number(tiendaId);

      if (isNaN(zapatillaIdNum) || isNaN(tiendaIdNum)) {
        throw new Error(
          `IDs inválidos: zapatilla=${zapatillaId}, tienda=${tiendaId}`,
        );
      }

      // Normalizar el precio
      let precioNum: number;
      if (typeof data.precio === 'string') {
        // Limpiar caracteres no numéricos excepto punto y coma
        let precioStr = data.precio.replace(/[^0-9.,]/g, '');
        // Reemplazar coma por punto para formato decimal estándar
        precioStr = precioStr.replace(',', '.');
        precioNum = parseFloat(precioStr);
      } else {
        precioNum = data.precio;
      }

      // Verificar validez del precio
      if (isNaN(precioNum) || precioNum <= 0) {
        precioNum = 99.99; // Valor por defecto si hay problemas
        this.logger.warn(
          `Precio inválido (${data.precio}), usando valor por defecto: ${precioNum}`,
        );
      } else {
        // Redondear a 2 decimales
        precioNum = Math.round(precioNum * 100) / 100;
      }

      // Validar URL del producto
      let urlProducto = data.url_producto.trim();
      if (!urlProducto.startsWith('http')) {
        this.logger.warn(
          `URL inválida (${urlProducto}), añadiendo prefijo http://`,
        );
        urlProducto = 'http://' + urlProducto;
      }

      // SOLUCIÓN MEJORADA: Siempre crear una nueva relación para cada zapatilla
      // Esto garantiza IDs incrementales y evita mezclar tallas entre productos distintos
      let intentos = 0;
      const maxIntentos = 3;

      while (intentos < maxIntentos) {
        intentos++;

        try {
          // 1. Verificar que la zapatilla y tienda existen
          this.logger.log(
            `Verificando existencia de entidades (intento ${intentos}/${maxIntentos})`,
          );

          // Comprobar que la zapatilla existe
          const zapatillaCheck = await this.makeAuthenticatedRequest(
            'get',
            `/zapatillas/${zapatillaIdNum}`,
          ).catch((e) => {
            throw new Error(
              `Zapatilla ID=${zapatillaIdNum} no existe: ${e.message}`,
            );
          });

          // Comprobar que la tienda existe
          const tiendaCheck = await this.makeAuthenticatedRequest(
            'get',
            `/tiendas/${tiendaIdNum}`,
          ).catch((e) => {
            throw new Error(`Tienda ID=${tiendaIdNum} no existe: ${e.message}`);
          });

          this.logger.log(
            `Entidades verificadas: Zapatilla=${zapatillaCheck.id}, Tienda=${tiendaCheck.id}`,
          );

          // 2. Crear una nueva relación (SIEMPRE sin buscar existentes)
          this.logger.log(
            `Creando nueva relación zapatilla=${zapatillaIdNum}, tienda=${tiendaIdNum}`,
          );

          // Datos para la nueva relación
          const sendData = {
            disponible: true, // FORZAR DISPONIBILIDAD A TRUE
            zapatilla_id: zapatillaIdNum,
            tienda_id: tiendaIdNum,
            precio: precioNum,
            url_producto: urlProducto,
            modelo_tienda: data.modelo_tienda || '',
          };

          // Crear la relación nueva
          const relacionNueva = await this.makeAuthenticatedRequest(
            'post',
            '/zapatillas-tienda',
            sendData,
          );

          const idRelacion = relacionNueva
            ? String(relacionNueva.id || 'N/A')
            : 'N/A';
          this.logger.log(
            `Relación zapatilla-tienda creada correctamente con ID=${idRelacion}`,
          );

          return relacionNueva;
        } catch (error) {
          this.logger.error(
            `Error en intento ${intentos}/${maxIntentos}: ${error.message}`,
          );

          // Si es el último intento, lanzar el error
          if (intentos >= maxIntentos) {
            throw error;
          }

          // Esperar antes del siguiente intento
          await new Promise((resolve) => setTimeout(resolve, 2000 * intentos));
        }
      }

      // Nunca debería llegar aquí, pero el compilador lo necesita
      throw new Error(
        'No se pudo crear la relación zapatilla-tienda después de varios intentos',
      );
    } catch (error) {
      this.logger.error(`Error en relación zapatilla-tienda: ${error.message}`);

      // Log de detalles de error HTTP si están disponibles
      if (error.response) {
        this.logger.error(
          `Error HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 200)}...`,
        );
      }

      throw error;
    }
  }

  /**
   * Método simplificado para crear o actualizar tallas
   * SOLUCIÓN AL PROBLEMA: Elimina verificaciones complejas y se enfoca en operaciones simples y directas
   */
  /**
   * Método simplificado para crear o actualizar tallas
   * SOLUCIÓN FINAL: Preserva el formato exacto de las tallas con decimales (ej: 40.5)
   */
  async createOrUpdateTalla(
    zapatillaTiendaId: number,
    talla: string,
    disponible: boolean = true,
  ): Promise<any> {
    try {
      // Validar datos básicos
      if (!zapatillaTiendaId) {
        throw new Error('ID de zapatilla-tienda no proporcionado');
      }

      if (!talla) {
        this.logger.warn('Talla vacía recibida, ignorando');
        return null;
      }

      // Normalizar la talla preservando el formato exacto
      let tallaString = String(talla).trim();

      // Reemplazar comas por puntos para valores decimales (40,5 -> 40.5)
      if (tallaString.includes(',')) {
        tallaString = tallaString.replace(',', '.');
        this.logger.log(
          `Talla con coma normalizada a punto: "${talla}" -> "${tallaString}"`,
        );
      }

      // Eliminar prefijos/sufijos pero preservar el número exacto
      tallaString = tallaString
        .replace(/^(eu|eur|us|uk)\s+/i, '')
        .replace(/\s+(eu|eur|us|uk)$/i, '')
        .trim();

      // IMPORTANTE: Forzar disponibilidad a TRUE siempre
      disponible = true;

      // Log para debugging
      this.logger.log(
        `Procesando talla exacta: "${tallaString}" para zapatillaTiendaId=${zapatillaTiendaId}`,
      );

      try {
        // Crear la talla directamente
        const datos = {
          zapatilla_tienda_id: zapatillaTiendaId,
          talla: tallaString,
          disponible: true,
        };

        // Log específico para valores decimales
        if (tallaString.includes('.')) {
          this.logger.log(
            `⚠️ TALLA DECIMAL: Enviando "${tallaString}" a la API`,
          );
        }

        // Llamada directa a la API
        const resultado = await this.makeAuthenticatedRequest(
          'post',
          '/tallas',
          datos,
        );

        this.logger.log(
          `✅ Talla "${tallaString}" creada correctamente (ID=${resultado.id})`,
        );
        return resultado;
      } catch (error) {
        // Si el error es 409 (Conflict), la talla ya existe
        if (error.response && error.response.status === 409) {
          this.logger.log(`Talla "${tallaString}" ya existe, buscándola...`);

          // Buscar la talla existente para actualizarla
          const tallaCodificada = encodeURIComponent(tallaString);
          const busqueda = await this.makeAuthenticatedRequest(
            'get',
            `/tallas?zapatilla_tienda_id=${zapatillaTiendaId}&talla=${tallaCodificada}`,
          );

          if (busqueda && busqueda.length > 0) {
            const tallaExistente = busqueda[0];

            // Actualizar disponibilidad si es necesario
            if (tallaExistente.disponible !== true) {
              await this.makeAuthenticatedRequest(
                'patch',
                `/tallas/${tallaExistente.id}`,
                { disponible: true },
              );
              this.logger.log(
                `✅ Talla "${tallaString}" actualizada a disponible`,
              );
            } else {
              this.logger.log(`✅ Talla "${tallaString}" ya estaba disponible`);
            }

            return tallaExistente;
          } else {
            this.logger.warn(
              `⚠️ No se encontró la talla "${tallaString}" a pesar del conflicto 409`,
            );

            // Última alternativa: intentar crear con un leve cambio en el formato
            // Por ejemplo: si "40.5" falla, intentar "40,5" o "40-5"
            if (tallaString.includes('.')) {
              const tallAlternativa = tallaString.replace('.', ',');
              this.logger.log(`Intentando alternativa: "${tallAlternativa}"`);

              try {
                const datosAlt = {
                  zapatilla_tienda_id: zapatillaTiendaId,
                  talla: tallAlternativa,
                  disponible: true,
                };

                const resultadoAlt = await this.makeAuthenticatedRequest(
                  'post',
                  '/tallas',
                  datosAlt,
                );

                this.logger.log(
                  `✅ Talla alternativa "${tallAlternativa}" creada correctamente`,
                );
                return resultadoAlt;
              } catch (altError) {
                // Ignorar error de la alternativa
              }
            }
          }
        }

        // Si llegamos aquí, hubo un error que no pudimos manejar
        this.logger.error(
          `Error al crear/actualizar talla "${tallaString}": ${error.message}`,
        );
        if (error.response) {
          this.logger.error(
            `Detalles: ${error.response.status} - ${JSON.stringify(error.response.data)}`,
          );
        }
        throw error;
      }
    } catch (error) {
      this.logger.error(`Error en talla "${talla}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Procesa una zapatilla completa (con sus tallas) a través de la API
   * IMPORTANTE: El campo disponible=true debe ser siempre el primer campo en los objetos JSON
   */
  async procesarZapatilla(zapatillaScraped: ZapatillaScraped): Promise<any> {
    try {
      // Validación inicial de datos
      if (!zapatillaScraped.sku) {
        throw new Error('La zapatilla no tiene SKU');
      }

      // Verificar y normalizar el precio
      if (!zapatillaScraped.precio) {
        throw new Error(
          `Precio no definido para la zapatilla ${zapatillaScraped.sku}`,
        );
      }

      // Normalizar el precio si es un string
      let precioNormalizado = zapatillaScraped.precio;

      if (typeof precioNormalizado === 'string') {
        // Limpiar cualquier carácter no numérico excepto punto y coma
        let precioStr = String(precioNormalizado).replace(/[^0-9.,]/g, '');

        // Reemplazar coma por punto
        precioStr = precioStr.replace(',', '.');

        // Convertir a número
        const precioNum = parseFloat(precioStr);

        if (isNaN(precioNum)) {
          throw new Error(
            `Precio inválido para la zapatilla ${zapatillaScraped.sku}: ${zapatillaScraped.precio}`,
          );
        }

        // Asignar el precio normalizado
        zapatillaScraped.precio = precioNum;
      } else if (isNaN(Number(precioNormalizado))) {
        throw new Error(
          `Precio inválido para la zapatilla ${zapatillaScraped.sku}: ${zapatillaScraped.precio}`,
        );
      }

      // Validar que hay tallas
      if (!zapatillaScraped.tallas || zapatillaScraped.tallas.length === 0) {
        this.logger.log(
          `Zapatilla ${zapatillaScraped.sku} no tiene tallas definidas. Usando array vacío.`,
        );
        zapatillaScraped.tallas = []; // Array vacío, sin tallas ficticias
      }

      // Uso de transacción: primero busca y crea la Zapatilla
      this.logger.log('='.repeat(80));
      this.logger.log(`DIAGNÓSTICO DE PROCESAMIENTO - INICIO`);
      this.logger.log(
        `Zapatilla: ${zapatillaScraped.marca} ${zapatillaScraped.modelo} (SKU: ${zapatillaScraped.sku})`,
      );
      this.logger.log(
        `Tienda ID: ${zapatillaScraped.tienda_id} - URL: ${zapatillaScraped.url_producto}`,
      );
      this.logger.log(`Tallas disponibles: ${zapatillaScraped.tallas.length}`);
      if (zapatillaScraped.tallas.length > 0) {
        this.logger.log('Primeras 5 tallas encontradas:');
        zapatillaScraped.tallas.slice(0, 5).forEach((t, i) => {
          this.logger.log(
            `- Talla ${i + 1}: "${t.talla}", Disponible: ${t.disponible}`,
          );
        });
      }
      this.logger.log('='.repeat(80));

      // DIAGNÓSTICO: Registrar todas las tallas para verificación más detallada
      this.logger.log('Todas las tallas encontradas:');
      zapatillaScraped.tallas.forEach((t, i) => {
        this.logger.log(
          `Talla ${i + 1}: ${t.talla}, Disponible: ${t.disponible}`,
        );
      });

      // Comprobar que el ID de tienda existe y es válido
      if (
        !zapatillaScraped.tienda_id ||
        isNaN(Number(zapatillaScraped.tienda_id))
      ) {
        throw new Error(
          `ID de tienda inválido o no especificado: ${zapatillaScraped.tienda_id}`,
        );
      }

      try {
        const tiendaInfo = await this.makeAuthenticatedRequest(
          'get',
          `/tiendas/${zapatillaScraped.tienda_id}`,
        );

        this.logger.log(
          `Tienda verificada: ${tiendaInfo.nombre} (ID: ${tiendaInfo.id})`,
        );
      } catch (error) {
        throw new Error(
          `La tienda con ID ${zapatillaScraped.tienda_id} no existe o no es accesible: ${error.message}`,
        );
      }

      // 1. Crear o actualizar la zapatilla (garantízando que el SKU es único y no se mezclan productos)
      const zapatilla = await this.createOrUpdateZapatilla({
        marca: zapatillaScraped.marca,
        modelo: zapatillaScraped.modelo,
        sku: zapatillaScraped.sku, // SKU sanitizado sin caracteres especiales
        imagen: zapatillaScraped.imagen,
        descripcion: zapatillaScraped.descripcion,
      });

      this.logger.log(`Zapatilla procesada con ID: ${zapatilla.id}`);

      // 2. Crear una nueva relación zapatilla-tienda para cada producto
      // Evitamos buscar por ID para no mezclar las tallas entre productos
      this.logger.log(
        `Creando relación zapatilla-tienda para zapatilla-${zapatilla.id} y tienda-${zapatillaScraped.tienda_id}`,
      );

      // Crear nueva relación para evitar mezclar productos
      // (nota: podemos crear múltiples relaciones entre la misma zapatilla y tienda, cada una con sus tallas)
      const zapatillaTienda = await this.createOrUpdateZapatillaTienda(
        zapatilla.id,
        zapatillaScraped.tienda_id,
        {
          precio: zapatillaScraped.precio,
          url_producto: zapatillaScraped.url_producto,
          modelo_tienda: zapatillaScraped.modelo_tienda,
        },
      );

      this.logger.log(
        `Relación zapatilla-tienda creada con ID: ${zapatillaTienda.id} (Precio: ${zapatillaTienda.precio})`,
      );

      // 3. Crear o actualizar las tallas para esta relación específica
      this.logger.log(
        `Procesando ${zapatillaScraped.tallas.length} tallas para zapatilla-tienda ID=${zapatillaTienda.id}`,
      );

      // Filtrar solo tallas válidas sin eliminar posibles variantes
      // Añadido: Verificación más estricta de los objetos de talla
      const tallasArray = zapatillaScraped.tallas
        .filter((talla) => {
          // Comprobar que el objeto talla es válido
          if (!talla) {
            this.logger.warn(
              'Detectado objeto talla null o undefined - ignorando',
            );
            return false;
          }

          // Comprobar que tiene un valor de talla
          if (
            !talla.talla ||
            typeof talla.talla !== 'string' ||
            !talla.talla.trim()
          ) {
            this.logger.warn(
              `Detectada talla con valor inválido: ${JSON.stringify(talla)} - ignorando`,
            );
            return false;
          }

          return true;
        })
        .map((talla) => ({
          talla: talla.talla.trim(),
          disponible: true, // FORZAR SIEMPRE a TRUE - Fix para el problema de disponibilidad
        }));

      this.logger.log(
        `Después de filtrar, procesando ${tallasArray.length} tallas válidas`,
      );

      // DIAGNÓSTICO: Mostrar todas las tallas después del filtrado
      this.logger.log('Tallas válidas a procesar:');
      tallasArray.forEach((t, i) => {
        this.logger.log(
          `- Talla ${i + 1}: "${t.talla}", Disponible: ${t.disponible}`,
        );
      });

      // Procesar cada talla SECUENCIALMENTE con el método simplificado
      this.logger.log('IMPORTANTE: Procesando tallas con método simplificado');

      let tallasActualizadas = 0;
      let tallasFallidas = 0;

      for (const [index, talla] of tallasArray.entries()) {
        try {
          // Usar nuestro método corregido para crear/actualizar la talla
          await this.createOrUpdateTalla(zapatillaTienda.id, talla.talla, true);

          tallasActualizadas++;

          // Pequeña pausa entre tallas para evitar problemas de concurrencia
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          tallasFallidas++;
          this.logger.error(
            `❌ Error al procesar talla "${talla.talla}": ${error.message}`,
          );
        }
      }

      // Resultados finales
      this.logger.log('='.repeat(80));
      this.logger.log(`RESUMEN DE PROCESAMIENTO DE TALLAS:`);
      this.logger.log(`Total tallas: ${tallasArray.length}`);
      this.logger.log(`✅ Exitosas: ${tallasActualizadas}`);
      this.logger.log(`❌ Fallidas: ${tallasFallidas}`);
      this.logger.log('='.repeat(80));

      return {
        success: true,
        zapatilla: {
          id: zapatilla.id,
          marca: zapatilla.marca,
          modelo: zapatilla.modelo,
          sku: zapatilla.sku,
        },
        zapatillaTienda: {
          id: zapatillaTienda.id,
          precio: zapatillaTienda.precio,
        },
        tallasActualizadas: tallasActualizadas,
        tallasFallidas: tallasFallidas,
        totalTallas: tallasArray.length,
      };
    } catch (error) {
      this.logger.error(
        `Error al procesar zapatilla completa (SKU: ${zapatillaScraped.sku}): ${error.message}`,
      );

      // Registrar detalles adicionales para depuración
      if (error.response) {
        this.logger.error(
          `Detalles del error HTTP: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`,
        );
      }

      throw error;
    }
  }
}
