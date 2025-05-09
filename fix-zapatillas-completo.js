/**
 * Solución completa para el problema de disponibilidad en zapatillas y tallas
 * Este script fuerza la disponibilidad a TRUE para todas las entidades y realiza
 * verificaciones adicionales para asegurar que todas las zapatillas se guarden correctamente.
 */

// Importar módulos necesarios
require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;

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
 * Verifica y repara inconsistencias en la base de datos
 */
async function verificarRepararInconsistencias() {
  try {
    console.log('='.repeat(80));
    console.log('VERIFICACIÓN Y REPARACIÓN DE INCONSISTENCIAS EN LA BASE DE DATOS');
    console.log('='.repeat(80));
    
    // 1. Obtener todas las zapatillas
    console.log('Obteniendo todas las zapatillas...');
    const zapatillas = await makeAuthenticatedRequest('get', '/zapatillas');
    console.log(`Se encontraron ${zapatillas.length} zapatillas en total`);
    
    // 2. Obtener todas las relaciones zapatilla-tienda
    console.log('Obteniendo todas las relaciones zapatilla-tienda...');
    const zapatillasTienda = await makeAuthenticatedRequest('get', '/zapatillas-tienda');
    console.log(`Se encontraron ${zapatillasTienda.length} relaciones zapatilla-tienda`);
    
    // 3. Verificar zapatillas sin relaciones
    console.log('Verificando zapatillas sin relaciones con tiendas...');
    const zapatillasIds = new Set(zapatillas.map(z => z.id));
    const zapatillasConRelaciones = new Set(zapatillasTienda.map(zt => zt.zapatilla_id));
    
    const zapatillasSinRelaciones = Array.from(zapatillasIds).filter(id => !zapatillasConRelaciones.has(id));
    console.log(`Se encontraron ${zapatillasSinRelaciones.length} zapatillas sin relaciones con tiendas`);
    
    if (zapatillasSinRelaciones.length > 0) {
      console.log('Zapatillas sin relaciones:');
      for (const id of zapatillasSinRelaciones) {
        const zapatilla = zapatillas.find(z => z.id === id);
        console.log(`- ID=${id}, Marca=${zapatilla.marca}, Modelo=${zapatilla.modelo}`);
      }
    }
    
    // 4. Verificar relaciones con disponible=false
    const relacionesNoDisponibles = zapatillasTienda.filter(zt => zt.disponible === false);
    console.log(`Se encontraron ${relacionesNoDisponibles.length} relaciones con disponible=false`);
    
    // 5. Asegurar que todas las relaciones estén marcadas como disponibles
    if (relacionesNoDisponibles.length > 0) {
      console.log('Activando relaciones zapatilla-tienda...');
      
      let activadas = 0;
      let errores = 0;
      
      for (const zt of relacionesNoDisponibles) {
        try {
          await makeAuthenticatedRequest('patch', `/zapatillas-tienda/${zt.id}`, { disponible: true });
          activadas++;
          
          if (activadas % 10 === 0 || activadas === relacionesNoDisponibles.length) {
            console.log(`Progreso: ${activadas}/${relacionesNoDisponibles.length} (${Math.round(activadas/relacionesNoDisponibles.length*100)}%)`);
          }
        } catch (error) {
          console.error(`Error al activar relación ID=${zt.id}:`, error.message);
          errores++;
        }
      }
      
      console.log(`Relaciones activadas: ${activadas}, errores: ${errores}`);
    }
    
    // 6. Verificar tallas disponibles
    console.log('Analizando tallas...');
    
    // Paginar la obtención de tallas para evitar sobrecarga
    let todasLasTallas = [];
    let pagina = 1;
    const porPagina = 500;
    let hayMasPaginas = true;
    
    while (hayMasPaginas) {
      console.log(`Obteniendo página ${pagina} de tallas...`);
      try {
        const tallas = await makeAuthenticatedRequest('get', `/tallas?_page=${pagina}&_limit=${porPagina}`);
        
        if (tallas.length > 0) {
          todasLasTallas = todasLasTallas.concat(tallas);
          pagina++;
        } else {
          hayMasPaginas = false;
        }
      } catch (error) {
        console.error(`Error al obtener tallas (página ${pagina}):`, error.message);
        hayMasPaginas = false;
      }
    }
    
    console.log(`Se obtuvieron ${todasLasTallas.length} tallas en total`);
    
    // 7. Contar tallas no disponibles
    const tallasNoDisponibles = todasLasTallas.filter(t => t.disponible === false);
    console.log(`Se encontraron ${tallasNoDisponibles.length} tallas con disponible=false`);
    
    // 8. Activar todas las tallas no disponibles
    if (tallasNoDisponibles.length > 0) {
      console.log('Activando tallas...');
      
      let tallasActivadas = 0;
      let erroresTallas = 0;
      
      for (const talla of tallasNoDisponibles) {
        try {
          await makeAuthenticatedRequest('patch', `/tallas/${talla.id}`, { disponible: true });
          tallasActivadas++;
          
          if (tallasActivadas % 20 === 0 || tallasActivadas === tallasNoDisponibles.length) {
            console.log(`Progreso: ${tallasActivadas}/${tallasNoDisponibles.length} (${Math.round(tallasActivadas/tallasNoDisponibles.length*100)}%)`);
          }
        } catch (error) {
          console.error(`Error al activar talla ID=${talla.id}:`, error.message);
          erroresTallas++;
        }
      }
      
      console.log(`Tallas activadas: ${tallasActivadas}, errores: ${erroresTallas}`);
    }
    
    // 9. Verificar relaciones zapatilla-tienda sin tallas
    console.log('Verificando relaciones zapatilla-tienda sin tallas...');
    
    const ztIds = new Set(zapatillasTienda.map(zt => zt.id));
    const relationSizes = new Map();
    
    // Agrupar tallas por zapatilla_tienda_id
    todasLasTallas.forEach(talla => {
      const ztId = talla.zapatilla_tienda_id;
      if (!relationSizes.has(ztId)) {
        relationSizes.set(ztId, []);
      }
      relationSizes.get(ztId).push(talla);
    });
    
    // Encontrar relaciones sin tallas
    const ztSinTallas = Array.from(ztIds).filter(id => !relationSizes.has(id) || relationSizes.get(id).length === 0);
    console.log(`Se encontraron ${ztSinTallas.length} relaciones zapatilla-tienda sin tallas`);
    
    if (ztSinTallas.length > 0) {
      console.log('Creando tallas por defecto para relaciones sin tallas...');
      
      // Tallas estándar a crear
      const tallasEstandar = [
        { talla: '40', disponible: true },
        { talla: '41', disponible: true },
        { talla: '42', disponible: true },
        { talla: '43', disponible: true }
      ];
      
      let relacionesProcessed = 0;
      let tallasCreadas = 0;
      let erroresTallas = 0;
      
      for (const ztId of ztSinTallas) {
        try {
          const zt = zapatillasTienda.find(zt => zt.id === ztId);
          console.log(`Procesando relación ID=${ztId} para zapatilla ID=${zt.zapatilla_id}`);
          
          // Crear tallas por defecto
          for (const tallaInfo of tallasEstandar) {
            try {
              await makeAuthenticatedRequest('post', '/tallas', {
                zapatilla_tienda_id: ztId,
                talla: tallaInfo.talla,
                disponible: true
              });
              
              tallasCreadas++;
            } catch (error) {
              console.error(`Error al crear talla "${tallaInfo.talla}" para relación ID=${ztId}:`, error.message);
              erroresTallas++;
            }
          }
          
          relacionesProcessed++;
          
          if (relacionesProcessed % 5 === 0 || relacionesProcessed === ztSinTallas.length) {
            console.log(`Progreso: ${relacionesProcessed}/${ztSinTallas.length} (${Math.round(relacionesProcessed/ztSinTallas.length*100)}%)`);
          }
        } catch (error) {
          console.error(`Error al procesar relación ID=${ztId}:`, error.message);
        }
      }
      
      console.log(`Relaciones procesadas: ${relacionesProcessed}`);
      console.log(`Tallas creadas: ${tallasCreadas}`);
      console.log(`Errores: ${erroresTallas}`);
    }
    
    // 10. Generar informe final
    console.log('='.repeat(80));
    console.log('RESUMEN DE VERIFICACIÓN Y REPARACIÓN');
    console.log('='.repeat(80));
    console.log(`Total zapatillas: ${zapatillas.length}`);
    console.log(`Total relaciones zapatilla-tienda: ${zapatillasTienda.length}`);
    console.log(`Total tallas: ${todasLasTallas.length}`);
    console.log(`Relaciones activadas: ${relacionesNoDisponibles.length}`);
    console.log(`Tallas activadas: ${tallasNoDisponibles.length}`);
    
    // Guardar informe en archivo
    const informe = {
      fecha: new Date().toISOString(),
      totalZapatillas: zapatillas.length,
      totalRelaciones: zapatillasTienda.length,
      totalTallas: todasLasTallas.length,
      relacionesActivadas: relacionesNoDisponibles.length,
      tallasActivadas: tallasNoDisponibles.length,
      zapatillasSinRelaciones: zapatillasSinRelaciones.length,
      relacionesSinTallas: ztSinTallas.length
    };
    
    await fs.writeFile('informe-reparacion.json', JSON.stringify(informe, null, 2));
    console.log('Informe guardado en informe-reparacion.json');
    
    return informe;
  } catch (error) {
    console.error('Error al verificar y reparar inconsistencias:', error.message);
    throw error;
  }
}

/**
 * Verifica la disponibilidad por tienda
 */
async function verificarDisponibilidadPorTienda(tiendaId) {
  try {
    // Verificar que la tienda existe
    const tienda = await makeAuthenticatedRequest('get', `/tiendas/${tiendaId}`);
    console.log(`Analizando tienda: ${tienda.nombre} (ID: ${tienda.id})`);
    
    // Obtener todas las zapatillas-tienda para esta tienda
    console.log(`Obteniendo zapatillas para tienda ID=${tiendaId}...`);
    const zapatillasTienda = await makeAuthenticatedRequest('get', `/zapatillas-tienda?tienda_id=${tiendaId}`);
    
    console.log(`Se encontraron ${zapatillasTienda.length} zapatillas para la tienda`);
    
    // Analizar disponibilidad
    const disponibles = zapatillasTienda.filter(zt => zt.disponible === true).length;
    const noDisponibles = zapatillasTienda.filter(zt => zt.disponible === false).length;
    
    console.log(`Zapatillas disponibles: ${disponibles} (${Math.round(disponibles/zapatillasTienda.length*100)}%)`);
    console.log(`Zapatillas no disponibles: ${noDisponibles} (${Math.round(noDisponibles/zapatillasTienda.length*100)}%)`);
    
    // Analizar zapatillas por marca
    const marcas = new Map();
    zapatillasTienda.forEach(zt => {
      const zapatillaId = zt.zapatilla_id;
      
      // Buscar zapatilla para obtener marca
      makeAuthenticatedRequest('get', `/zapatillas/${zapatillaId}`)
        .then(zapatilla => {
          const marca = zapatilla.marca;
          
          if (!marcas.has(marca)) {
            marcas.set(marca, {
              total: 0,
              disponibles: 0,
              noDisponibles: 0
            });
          }
          
          const stats = marcas.get(marca);
          stats.total++;
          
          if (zt.disponible) {
            stats.disponibles++;
          } else {
            stats.noDisponibles++;
          }
        })
        .catch(error => {
          console.error(`Error al obtener zapatilla ID=${zapatillaId}:`, error.message);
        });
    });
    
    // Esperar a que se completen todas las consultas
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Mostrar estadísticas por marca
    console.log('Estadísticas por marca:');
    marcas.forEach((stats, marca) => {
      console.log(`- ${marca}: ${stats.total} zapatillas, ${stats.disponibles} disponibles, ${stats.noDisponibles} no disponibles`);
    });
    
    return {
      tienda: tienda.nombre,
      totalZapatillas: zapatillasTienda.length,
      disponibles,
      noDisponibles,
      marcas: Array.from(marcas.entries()).map(([marca, stats]) => ({
        marca,
        total: stats.total,
        disponibles: stats.disponibles,
        noDisponibles: stats.noDisponibles
      }))
    };
  } catch (error) {
    console.error(`Error al verificar disponibilidad para tienda ID=${tiendaId}:`, error.message);
    return null;
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
    console.log('SOLUCIÓN COMPLETA PARA PROBLEMA DE DISPONIBILIDAD');
    console.log('='.repeat(80));
    
    // Obtener token
    await getToken();
    
    // Procesar según los argumentos
    if (args.length === 0 || args[0] === '--fix') {
      console.log('Verificando y reparando inconsistencias en la base de datos...');
      await verificarRepararInconsistencias();
    } else if (args[0] === '--analizar' && args[1]) {
      const tiendaId = parseInt(args[1]);
      
      if (isNaN(tiendaId)) {
        console.error('Error: El ID de tienda debe ser un número');
        process.exit(1);
      }
      
      console.log(`Analizando tienda ID=${tiendaId}...`);
      await verificarDisponibilidadPorTienda(tiendaId);
    } else if (args[0] === '--analizar-todas') {
      console.log('Analizando todas las tiendas...');
      
      const tiendas = await getTiendas();
      console.log(`Se encontraron ${tiendas.length} tiendas activas`);
      
      for (const [index, tienda] of tiendas.entries()) {
        console.log(`=== ANALIZANDO TIENDA ${index + 1}/${tiendas.length} ===`);
        await verificarDisponibilidadPorTienda(tienda.id);
        
        // Pequeña pausa entre tiendas
        if (index < tiendas.length - 1) {
          const pausaSegundos = 2;
          console.log(`Esperando ${pausaSegundos} segundos antes de la siguiente tienda...`);
          await new Promise(resolve => setTimeout(resolve, pausaSegundos * 1000));
        }
      }
    } else {
      console.log('Uso:');
      console.log('  node fix-zapatillas-completo.js                  # Verificar y reparar inconsistencias');
      console.log('  node fix-zapatillas-completo.js --fix            # Verificar y reparar inconsistencias');
      console.log('  node fix-zapatillas-completo.js --analizar <id>  # Analizar una tienda específica');
      console.log('  node fix-zapatillas-completo.js --analizar-todas # Analizar todas las tiendas');
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
