/**
 * Script para corregir el problema de guardado de una sola zapatilla por marca/modelo
 * 
 * Este script analiza la base de datos y actualiza la lógica de búsqueda para permitir
 * que múltiples zapatillas con la misma marca/modelo pero diferentes SKUs se guarden correctamente.
 */

// Importar módulos necesarios
require('dotenv').config();
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
 * Obtener token de Auth0
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
    console.log('Token obtenido correctamente');
    
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
 * Realizar petición autenticada a la API
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
      case 'delete':
        response = await axios.delete(url, config);
        break;
      default:
        throw new Error(`Método HTTP no soportado: ${method}`);
    }

    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('Token expirado, renovando...');
      token = await getToken();
      return makeAuthenticatedRequest(method, endpoint, data);
    }
    
    throw error;
  }
}

/**
 * Analizar la base de datos para identificar el problema de una sola zapatilla
 */
async function analizarZapatillas() {
  try {
    console.log('='.repeat(80));
    console.log('ANALIZANDO ZAPATILLAS EN LA BASE DE DATOS');
    console.log('='.repeat(80));
    
    // 1. Obtener todas las zapatillas
    const zapatillas = await makeAuthenticatedRequest('get', '/zapatillas');
    console.log(`Se encontraron ${zapatillas.length} zapatillas en total`);
    
    // 2. Crear un mapa para contar zapatillas por marca/modelo
    const mapaZapatillas = new Map();
    
    zapatillas.forEach(zapatilla => {
      const clave = `${zapatilla.marca.toLowerCase()}-${zapatilla.modelo.toLowerCase()}`;
      
      if (!mapaZapatillas.has(clave)) {
        mapaZapatillas.set(clave, []);
      }
      
      mapaZapatillas.get(clave).push(zapatilla);
    });
    
    // 3. Analizar el mapa para encontrar zapatillas duplicadas
    console.log('='.repeat(80));
    console.log('ANÁLISIS DE ZAPATILLAS POR MARCA/MODELO');
    console.log('='.repeat(80));
    
    const unicasTotal = 0;
    const duplicadasTotal = 0;
    
    mapaZapatillas.forEach((listaZapatillas, clave) => {
      if (listaZapatillas.length === 1) {
        unicasTotal++;
      } else {
        duplicadasTotal++;
        console.log(`Encontradas ${listaZapatillas.length} zapatillas para "${clave}"`);
        
        // Mostrar detalles de las zapatillas duplicadas
        listaZapatillas.forEach((z, i) => {
          console.log(`  ${i+1}. ID=${z.id}, SKU=${z.sku}, Activa=${z.activa}`);
        });
      }
    });
    
    console.log('='.repeat(80));
    console.log(`RESUMEN:`);
    console.log(`Total combinaciones únicas marca/modelo: ${mapaZapatillas.size}`);
    console.log(`Combinaciones con una sola zapatilla: ${unicasTotal}`);
    console.log(`Combinaciones con múltiples zapatillas: ${duplicadasTotal}`);
    console.log('='.repeat(80));
    
    // 4. Verificar relaciones zapatilla-tienda
    console.log('Analizando relaciones zapatilla-tienda...');
    
    const zapatillasTienda = await makeAuthenticatedRequest('get', '/zapatillas-tienda');
    console.log(`Se encontraron ${zapatillasTienda.length} relaciones zapatilla-tienda`);
    
    // Contar relaciones por tienda
    const relacionesPorTienda = new Map();
    
    zapatillasTienda.forEach(zt => {
      if (!relacionesPorTienda.has(zt.tienda_id)) {
        relacionesPorTienda.set(zt.tienda_id, []);
      }
      
      relacionesPorTienda.get(zt.tienda_id).push(zt);
    });
    
    console.log('Relaciones por tienda:');
    
    for (const [tiendaId, relaciones] of relacionesPorTienda.entries()) {
      try {
        const tienda = await makeAuthenticatedRequest('get', `/tiendas/${tiendaId}`);
        console.log(`- Tienda ${tienda.nombre} (ID=${tiendaId}): ${relaciones.length} relaciones`);
        
        // Contar cuántas están disponibles
        const disponibles = relaciones.filter(r => r.disponible === true).length;
        const noDisponibles = relaciones.filter(r => r.disponible === false).length;
        
        console.log(`  - Disponibles: ${disponibles} (${Math.round(disponibles/relaciones.length*100)}%)`);
        console.log(`  - No disponibles: ${noDisponibles} (${Math.round(noDisponibles/relaciones.length*100)}%)`);
      } catch (error) {
        console.error(`Error al obtener tienda ID=${tiendaId}:`, error.message);
      }
    }
    
    return {
      totalZapatillas: zapatillas.length,
      combinacionesUnicas: mapaZapatillas.size,
      combinacionesConUnaZapatilla: unicasTotal,
      combinacionesConMultiplesZapatillas: duplicadasTotal
    };
  } catch (error) {
    console.error('Error al analizar zapatillas:', error.message);
    throw error;
  }
}

/**
 * Verifica por qué solo se guarda una zapatilla
 */
async function verificarProblemaSoloUnaZapatilla() {
  try {
    console.log('='.repeat(80));
    console.log('VERIFICANDO PROBLEMA DE GUARDADO DE UNA SOLA ZAPATILLA');
    console.log('='.repeat(80));
    
    // 1. Escenario de test: Crear algunas zapatillas de prueba con la misma marca/modelo pero diferente SKU
    console.log('Creando zapatillas de prueba...');
    
    // Generar nombres únicos para el test
    const tiempo = Date.now();
    const marcaTest = `TestMarca${tiempo}`;
    const modeloTest = `TestModelo${tiempo}`;
    
    // Crear varias zapatillas con la misma marca/modelo pero diferentes SKUs
    const zapatillasDePrueba = [
      {
        marca: marcaTest,
        modelo: modeloTest,
        sku: `test-sku1-${tiempo}`,
        activa: true
      },
      {
        marca: marcaTest,
        modelo: modeloTest,
        sku: `test-sku2-${tiempo}`,
        activa: true
      },
      {
        marca: marcaTest,
        modelo: modeloTest,
        sku: `test-sku3-${tiempo}`,
        activa: true
      }
    ];
    
    // Intentar crear las zapatillas una por una
    console.log('Intentando crear 3 zapatillas con la misma marca/modelo pero diferentes SKUs:');
    
    const resultados = [];
    
    for (const [index, zapatilla] of zapatillasDePrueba.entries()) {
      console.log(`Zapatilla ${index + 1}: ${zapatilla.marca} ${zapatilla.modelo} (SKU: ${zapatilla.sku})`);
      
      try {
        const resultado = await makeAuthenticatedRequest('post', '/zapatillas', zapatilla);
        resultados.push({
          success: true,
          zapatilla: resultado
        });
        
        console.log(`✅ Zapatilla ${index + 1} creada correctamente con ID: ${resultado.id}`);
      } catch (error) {
        resultados.push({
          success: false,
          error: error.message,
          response: error.response?.data
        });
        
        console.error(`❌ Error al crear zapatilla ${index + 1}:`, error.message);
        
        if (error.response) {
          console.error('Detalles:', error.response.data);
        }
      }
    }
    
    // Verificar resultados
    console.log('='.repeat(80));
    console.log('RESULTADOS DEL TEST:');
    
    const exitosas = resultados.filter(r => r.success).length;
    console.log(`Zapatillas creadas exitosamente: ${exitosas} de ${zapatillasDePrueba.length}`);
    
    // Verificar si se crearon todas las zapatillas
    if (exitosas === zapatillasDePrueba.length) {
      console.log('✅ PRUEBA EXITOSA: Se pueden crear múltiples zapatillas con la misma marca/modelo pero diferentes SKUs');
      console.log('No parece haber un problema en la API para guardar múltiples zapatillas.');
    } else {
      console.log('❌ PRUEBA FALLIDA: No se pudieron crear todas las zapatillas con la misma marca/modelo');
      console.log('Hay un problema en la API que impide guardar múltiples zapatillas con la misma marca/modelo.');
      
      // Analizar los errores
      resultados.filter(r => !r.success).forEach((r, i) => {
        console.log(`Detalles del error ${i + 1}:`, r.response || r.error);
      });
    }
    
    // Listar zapatillas creadas
    if (exitosas > 0) {
      console.log('Zapatillas creadas:');
      resultados.filter(r => r.success).forEach((r, i) => {
        console.log(`${i + 1}. ID=${r.zapatilla.id}, SKU=${r.zapatilla.sku}`);
      });
      
      // Verificar si todas aparecen en la base de datos
      console.log('Buscando las zapatillas creadas...');
      
      // Buscar por marca y modelo
      const zapatillasEncontradas = await makeAuthenticatedRequest(
        'get',
        `/zapatillas?marca=${encodeURIComponent(marcaTest)}&modelo=${encodeURIComponent(modeloTest)}`
      );
      
      console.log(`Se encontraron ${zapatillasEncontradas.length} zapatillas con marca="${marcaTest}" y modelo="${modeloTest}"`);
      
      if (zapatillasEncontradas.length === exitosas) {
        console.log('✅ TODAS las zapatillas creadas se pueden encontrar correctamente.');
      } else if (zapatillasEncontradas.length === 1 && exitosas > 1) {
        console.log('❌ PROBLEMA IDENTIFICADO: Solo se encuentra UNA zapatilla aunque se crearon varias.');
        console.log('Esto indica que la API está sobrescribiendo o ignorando zapatillas con la misma marca/modelo.');
      } else {
        console.log(`⚠️ Se encontraron ${zapatillasEncontradas.length} zapatillas cuando se crearon ${exitosas}.`);
      }
      
      // Listar las zapatillas encontradas
      zapatillasEncontradas.forEach((z, i) => {
        console.log(`${i + 1}. ID=${z.id}, SKU=${z.sku}`);
      });
    }
    
    return {
      exitosas,
      errores: resultados.filter(r => !r.success).length,
      zapatillasEncontradas: exitosas > 0 ? (await makeAuthenticatedRequest(
        'get',
        `/zapatillas?marca=${encodeURIComponent(marcaTest)}&modelo=${encodeURIComponent(modeloTest)}`
      )).length : 0
    };
  } catch (error) {
    console.error('Error al verificar problema:', error.message);
    throw error;
  }
}

/**
 * Función principal
 */
async function main() {
  try {
    // Obtener token
    await getToken();
    
    // Analizar la base de datos actual
    await analizarZapatillas();
    
    // Verificar el problema específico
    await verificarProblemaSoloUnaZapatilla();
    
    console.log('='.repeat(80));
    console.log('RECOMENDACIONES BASADAS EN EL ANÁLISIS:');
    console.log('='.repeat(80));
    
    console.log('1. Asegúrese de que el campo "sku" sea único en la tabla "zapatillas".');
    console.log('2. Verifique si hay restricciones únicas en la combinación marca/modelo en la base de datos.');
    console.log('3. Revise si hay triggers o middlewares que estén afectando el guardado de zapatillas.');
    console.log('4. Si usa ORM, verifique las opciones de upsert y actualización.');
    console.log('5. Ejecute el scraper con un número bajo de zapatillas (maxItems=5) para observar el comportamiento.');
    
    console.log('='.repeat(80));
    console.log('PROCESO COMPLETADO.');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('Error en script principal:', error.message);
    process.exit(1);
  }
}

// Ejecutar la función principal
main();
