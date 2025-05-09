/**
 * Script para activar zapatillas y tallas
 * 
 * Este script permite activar todas las zapatillas y tallas para una tienda específica
 * o para todas las tiendas. Es útil para corregir problemas de disponibilidad en el scraper.
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
 * Obtiene todas las tiendas
 */
async function getTiendas() {
  try {
    const tiendas = await makeAuthenticatedRequest('get', '/tiendas');
    return tiendas.filter(t => t.activa);
  } catch (error) {
    console.error('Error al obtener tiendas:', error.message);
    return [];
  }
}

/**
 * Activa todas las zapatillas y tallas para una tienda específica
 */
async function activarZapatillasPorTienda(tiendaId) {
  try {
    // Verificar que la tienda existe
    const tienda = await makeAuthenticatedRequest('get', `/tiendas/${tiendaId}`);
    console.log(`Procesando tienda: ${tienda.nombre} (ID: ${tienda.id})`);
    
    // Obtener todas las zapatillas-tienda para esta tienda
    console.log(`Obteniendo zapatillas para tienda ID=${tiendaId}...`);
    const zapatillasTienda = await makeAuthenticatedRequest('get', `/zapatillas-tienda?tienda_id=${tiendaId}`);
    
    console.log(`Se encontraron ${zapatillasTienda.length} zapatillas para la tienda`);
    
    // Contar cuántas están marcadas como no disponibles
    const noDisponibles = zapatillasTienda.filter(zt => zt.disponible === false).length;
    console.log(`De ellas, ${noDisponibles} están marcadas como no disponibles`);
    
    // Actualizar zapatillas no disponibles
    if (noDisponibles > 0) {
      console.log(`Activando ${noDisponibles} zapatillas...`);
      
      let activadas = 0;
      let errores = 0;
      
      for (const zt of zapatillasTienda) {
        if (zt.disponible === false) {
          try {
            await makeAuthenticatedRequest('patch', `/zapatillas-tienda/${zt.id}`, { disponible: true });
            activadas++;
            
            if (activadas % 5 === 0 || activadas === noDisponibles) {
              console.log(`Progreso: ${activadas}/${noDisponibles} (${Math.round(activadas/noDisponibles*100)}%)`);
            }
          } catch (error) {
            console.error(`Error al activar zapatilla-tienda ID=${zt.id}:`, error.message);
            errores++;
          }
        }
      }
      
      console.log(`Zapatillas activadas: ${activadas}, errores: ${errores}`);
    } else {
      console.log('Todas las zapatillas ya están activas.');
    }
    
    // Procesar tallas para cada zapatilla-tienda
    console.log('Procesando tallas para todas las zapatillas...');
    
    let totalTallas = 0;
    let tallasActivadas = 0;
    let erroresTallas = 0;
    
    for (const [index, zt] of zapatillasTienda.entries()) {
      console.log(`[${index + 1}/${zapatillasTienda.length}] Procesando tallas para zapatilla-tienda ID=${zt.id}...`);
      
      try {
        // Obtener tallas para esta zapatilla-tienda
        const tallas = await makeAuthenticatedRequest('get', `/tallas?zapatilla_tienda_id=${zt.id}`);
        
        if (tallas.length === 0) {
          console.log(`No se encontraron tallas para zapatilla-tienda ID=${zt.id}`);
          continue;
        }
        
        const tallasNoDisponibles = tallas.filter(t => t.disponible === false);
        totalTallas += tallasNoDisponibles.length;
        
        console.log(`Se encontraron ${tallas.length} tallas, ${tallasNoDisponibles.length} no disponibles`);
        
        // Activar tallas no disponibles
        for (const talla of tallasNoDisponibles) {
          try {
            await makeAuthenticatedRequest('patch', `/tallas/${talla.id}`, { disponible: true });
            tallasActivadas++;
          } catch (error) {
            console.error(`Error al activar talla ID=${talla.id}:`, error.message);
            erroresTallas++;
          }
        }
      } catch (error) {
        console.error(`Error al procesar tallas para zapatilla-tienda ID=${zt.id}:`, error.message);
      }
    }
    
    console.log(`=== RESUMEN TALLAS ===`);
    console.log(`Total tallas no disponibles: ${totalTallas}`);
    console.log(`Tallas activadas: ${tallasActivadas}`);
    console.log(`Errores: ${erroresTallas}`);
    
    return {
      tienda: tienda.nombre,
      zapatillas: zapatillasTienda.length,
      zapatillasActivadas: noDisponibles,
      tallasNoDisponibles: totalTallas,
      tallasActivadas: tallasActivadas
    };
  } catch (error) {
    console.error(`Error al procesar tienda ID=${tiendaId}:`, error.message);
    return null;
  }
}

/**
 * Procesa todas las tiendas
 */
async function activarZapatillasTodasLasTiendas() {
  try {
    // Obtener todas las tiendas
    const tiendas = await getTiendas();
    console.log(`Se encontraron ${tiendas.length} tiendas activas`);
    
    const resultados = [];
    
    // Procesar cada tienda
    for (const [index, tienda] of tiendas.entries()) {
      console.log(`=== PROCESANDO TIENDA ${index + 1}/${tiendas.length} ===`);
      const resultado = await activarZapatillasPorTienda(tienda.id);
      
      if (resultado) {
        resultados.push(resultado);
      }
      
      // Pequeña pausa entre tiendas para no sobrecargar la API
      if (index < tiendas.length - 1) {
        const pausaSegundos = 5;
        console.log(`Esperando ${pausaSegundos} segundos antes de la siguiente tienda...`);
        await new Promise(resolve => setTimeout(resolve, pausaSegundos * 1000));
      }
    }
    
    // Mostrar resumen final
    console.log('='.repeat(80));
    console.log('RESUMEN FINAL');
    console.log('='.repeat(80));
    
    console.log('Tiendas procesadas:');
    let totalZapatillas = 0;
    let totalZapatillasActivadas = 0;
    let totalTallasNoDisponibles = 0;
    let totalTallasActivadas = 0;
    
    for (const resultado of resultados) {
      console.log(`- ${resultado.tienda}: ${resultado.zapatillasActivadas} zapatillas activadas, ${resultado.tallasActivadas} tallas activadas`);
      totalZapatillas += resultado.zapatillas;
      totalZapatillasActivadas += resultado.zapatillasActivadas;
      totalTallasNoDisponibles += resultado.tallasNoDisponibles;
      totalTallasActivadas += resultado.tallasActivadas;
    }
    
    console.log('');
    console.log(`Total zapatillas encontradas: ${totalZapatillas}`);
    console.log(`Total zapatillas activadas: ${totalZapatillasActivadas}`);
    console.log(`Total tallas no disponibles: ${totalTallasNoDisponibles}`);
    console.log(`Total tallas activadas: ${totalTallasActivadas}`);
    
    return resultados;
  } catch (error) {
    console.error('Error al procesar todas las tiendas:', error.message);
    throw error;
  }
}

/**
 * Función principal
 */
async function main() {
  try {
    // Verificar argumentos
    const args = process.argv.slice(2);
    
    console.log('='.repeat(80));
    console.log('ACTIVACIÓN DE ZAPATILLAS Y TALLAS');
    console.log('='.repeat(80));
    
    // Obtener token
    await getToken();
    
    // Procesar según los argumentos
    if (args.length === 0) {
      console.log('Procesando todas las tiendas...');
      await activarZapatillasTodasLasTiendas();
    } else if (args[0] === '--tienda' && args[1]) {
      const tiendaId = parseInt(args[1]);
      
      if (isNaN(tiendaId)) {
        console.error('Error: El ID de tienda debe ser un número');
        process.exit(1);
      }
      
      console.log(`Procesando tienda ID=${tiendaId}...`);
      await activarZapatillasPorTienda(tiendaId);
    } else {
      console.log('Uso:');
      console.log('  node activar-zapatillas.js                  # Procesar todas las tiendas');
      console.log('  node activar-zapatillas.js --tienda <id>    # Procesar una tienda específica');
      process.exit(1);
    }
    
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
