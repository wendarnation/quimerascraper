// // src/scraper/interfaces/zapatilla-scraper.interface.ts
// export interface ZapatillaScraped {
//   marca: string;
//   modelo: string;
//   sku: string;
//   imagen?: string;
//   descripcion?: string;
//   precio: number | string;
//   url_producto: string;
//   tallas: TallaScraped[];
//   tienda_id: number;
//   modelo_tienda?: string;
// }

// export interface TallaScraped {
//   talla: string;
//   disponible: boolean;
// }

// export interface TiendaInfo {
//   id: number;
//   nombre: string;
//   url: string;
// }

// export interface ScraperOptions {
//   maxItems?: number;
//   browser?: any; // Instancia de Browser de Playwright
//   headless?: boolean;
// }

// src/scraper/interfaces/quimera-scraper.interface.ts
export interface ZapatillaScraped {
  marca: string;
  modelo: string;
  sku: string;
  imagen?: string;
  descripcion?: string;
  precio: number | string;
  url_producto: string;
  tallas: TallaScraped[];
  tienda_id: number;
  modelo_tienda?: string;
  color?: string;
  genero?: string;
  categoria?: string;
  fecha_scrape?: Date;
}

export interface TallaScraped {
  talla: string;
  disponible: boolean;
  precio_talla?: number;
  stock?: number;
}

export interface TiendaInfo {
  id: number;
  nombre: string;
  url: string;
  pais?: string;
  moneda?: string;
}

export interface ScraperOptions {
  maxItems?: number;
  browser?: any; // Instancia de Browser de Playwright
  headless?: boolean;
  proxyUrl?: string | null; // URL del proxy a utilizar (ej: "http://username:password@proxy.example.com:8080")
  stealth?: boolean; // Activar o desactivar modo stealth para evadir detección
  paginasMaximas?: number; // Número máximo de páginas a scrapear
  reintentos?: number; // Número de reintentos para peticiones fallidas
  interceptaciones?: boolean; // Interceptar peticiones para modificarlas o bloquearlas
  userAgentRotation?: boolean; // Rotar User-Agents automáticamente
  tiempoMaximoEjecucion?: number; // Tiempo máximo de ejecución en ms
  capturaErrores?: boolean; // Capturar screenshots en caso de errores
  logLevel?: 'debug' | 'info' | 'warn' | 'error'; // Nivel de logging
  cookiesPersonalizadas?: Record<string, string>; // Cookies a establecer manualmente
  filtros?: {
    // Filtros para la búsqueda
    marcas?: string[];
    precioMin?: number;
    precioMax?: number;
    genero?: string;
    categorias?: string[];
  };
}

export interface ScraperResult {
  zapatillas: ZapatillaScraped[];
  tiempoEjecucion: number;
  errores: string[];
  totalProductos: number;
  tienda: TiendaInfo;
  fechaEjecucion: Date;
}

export interface DataExtractorOptions {
  selector?: string;
  atributo?: string;
  regexp?: string;
  transformacion?: (valor: string) => any;
  default?: any;
}
