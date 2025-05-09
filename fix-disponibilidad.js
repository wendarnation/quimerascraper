/**
 * Script para corregir la disponibilidad en zapatillas-tienda y tallas
 * 
 * Este script actualiza todas las entradas en las tablas zapatillas-tienda y tallas
 * y establece disponible = true para todos los registros.
 */

// Importar dotenv para cargar variables de entorno
require('dotenv').config();

// Importar Axios para hacer peticiones HTTP
const axios = require('axios');

// Variables de configuración
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_SCRAPER_CLIENT_ID;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_SCRAPER_CLIENT_SECRET;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

// Token global
let token = null;

/**
 * Obtiene un token de autenticación de Auth0
 */
async function getToken() {
  try {
    console.log('Obteniendo token de Auth0...');
    
    const response = await axios.post(
      `https://${AUTH0_DOMAIN}/oauth/token`,
      {
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        audience: AUTH0_AUDIENCE,
        grant_type: 'client_credentials',
        scope: 'admin:zapatillas',
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    token = response.data.access_token;
    console.log('Token obtenido correctamente.');
    
    return token;
  } catch (error) {
    console.error('Error al obtener token:', error.message);
    if (error.response) {
      console.error('Detalles:', error.response.data);
    }
    throw new Error('No se pudo obtener el token de autenticación');
  }
}

/**
 * Realiza una petición autenticada a la API
 */
async function makeAuthenticatedRequest(method, endpoint, data = null) {
  if (!token) {
    token = await getToken();
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  try {
    let response;
    
    switch (method.toLowerCase()) {
      case 'get':
        response = await axios.get(url, config);
        break;
      case 'post':
        response = await axios.post(url, data, config);
        break;
      case 'put':
        response = await axios.put(url, data, config);
        break;
      case 'patch':
        response = await axios.patch(url, data, config);
        break;
      default:
        throw new Error(`Método HTTP no soportado: ${method}`);
    }

    return response.data;
  } catch (error) {
    console.error(`Error en request ${method} a ${endpoint}:`, error.message);
    
    if (error.response) {
      console.error(`Status: ${error.response.status}, Data:`, error.response.data);
      
      // Si es error de autenticación (401), renovar token y reintentar
      if (error.response.status === 401) {
        console.log('Token expirado, obteniendo uno nuevo...');
        token = await getToken();
        return makeAuthenticatedRequest(method, endpoint, data);
      }
    }
    
    throw error;
  }
}

/**
 * Actualiza todas las zapatillas-tienda a disponible = true
 */
async function actualizarZapatillasTienda() {
  try {
    console.log('='.repeat(80));
    console.log('ACTUALIZANDO ZAPATILLAS-TIENDA');
    console.log('='.repeat(80));
    
    // Obtener todas las zapatillas-tienda
    const zapatillasTienda = await makeAuthenticatedRequest('get', '/zapatillas-tienda');
    console.log(`Se encontraron ${zapatillasTienda.length} relaciones zapatilla-tienda`);
    
    // Contar cuántas están actualmente no disponibles
    const noDisponibles = zapatillasTienda.filter(zt => zt.disponible === false).length;
    console.log(`De ellas, ${noDisponibles} están marcadas como no disponibles`);
    
    if (noDisponibles === 0) {
      console.log('Todas las zapatillas-tienda ya están marcadas como disponibles. Saltando actualización.');
      return;
    }

    console.log(`Actualizando ${noDisponibles} registros a disponible = true...`);
    
    // Para cada zapatilla-tienda no disponible, actualizar a disponible = true
    let actualizadas = 0;
    let errores = 0;
    
    for (const zt of zapatillasTienda) {
      if (zt.disponible === false) {
        try {
          await makeAuthenticatedRequest('patch', `/zapatillas-tienda/${zt.id}`, { disponible: true });
          actualizadas++;
          
          // Mostrar progreso
          if (actualizadas % 10 === 0 || actualizadas === noDisponibles) {
            console.log(`Progreso: ${actualizadas}/${noDisponibles} (${Math.round(actualizadas/noDisponibles*100)}%)`);
          }
        } catch (error) {
          console.error(`Error al actualizar zapatilla-tienda ID=${zt.id}:`, error.message);
          errores++;
        }
      }
    }
    
    console.log(`Actualización completada: ${actualizadas} actualizadas, ${errores} errores`);
  } catch (error) {
    console.error('Error al actualizar zapatillas-tienda:', error.message);
  }
}

/**
 * Actualiza todas las tallas a disponible = true
 */
async function actualizarTallas() {
  try {
    console.log('='.repeat(80));
    console.log('ACTUALIZANDO TALLAS');
    console.log('='.repeat(80));
    
    // Obtener todas las tallas (con paginación para evitar sobrecarga)
    let todasLasTallas = [];
    let pagina = 1;
    const porPagina = 100;
    let hayMasPaginas = true;
    
    while (hayMasPaginas) {
      console.log(`Obteniendo página ${pagina} de tallas...`);
      const tallas = await makeAuthenticatedRequest('get', `/tallas?_page=${pagina}&_limit=${porPagina}`);
      
      if (tallas.length > 0) {
        todasLasTallas = todasLasTallas.concat(tallas);
        pagina++;
      } else {
        hayMasPaginas = false;
      }
    }
    
    console.log(`Se encontraron ${todasLasTallas.length} tallas en total`);
    
    // Contar cuántas están actualmente no disponibles
    const noDisponibles = todasLasTallas.filter(t => t.disponible === false).length;
    console.log(`De ellas, ${noDisponibles} están marcadas como no disponibles`);
    
    if (noDisponibles === 0) {
      console.log('Todas las tallas ya están marcadas como disponibles. Saltando actualización.');
      return;
    }

    console.log(`Actualizando ${noDisponibles} tallas a disponible = true...`);
    
    // Para cada talla no disponible, actualizar a disponible = true
    let actualizadas = 0;
    let errores = 0;
    
    for (const talla of todasLasTallas) {
      if (talla.disponible === false) {
        try {
          await makeAuthenticatedRequest('patch', `/tallas/${talla.id}`, { disponible: true });
          actualizadas++;
          
          // Mostrar progreso
          if (actualizadas % 20 === 0 || actualizadas === noDisponibles) {
            console.log(`Progreso: ${actualizadas}/${noDisponibles} (${Math.round(actualizadas/noDisponibles*100)}%)`);
          }
        } catch (error) {
          console.error(`Error al actualizar talla ID=${talla.id}:`, error.message);
          errores++;
        }
      }
    }
    
    console.log(`Actualización completada: ${actualizadas} actualizadas, ${errores} errores`);
  } catch (error) {
    console.error('Error al actualizar tallas:', error.message);
  }
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log('Iniciando script de corrección de disponibilidad...');
    
    // Obtener token de autenticación
    await getToken();
    
    // Actualizar zapatillas-tienda
    await actualizarZapatillasTienda();
    
    // Actualizar tallas
    await actualizarTallas();
    
    console.log('='.repeat(80));
    console.log('PROCESO COMPLETADO CORRECTAMENTE');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('Error en el script:', error.message);
    process.exit(1);
  }
}

// Ejecutar la función principal
main();
