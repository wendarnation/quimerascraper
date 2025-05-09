/**
 * Script simplificado para activar todas las zapatillas y tallas inmediatamente
 */

const axios = require('axios');
require('dotenv').config();

// Configuración
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_SCRAPER_CLIENT_ID;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_SCRAPER_CLIENT_SECRET;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

let authToken = null;

// Obtener token de autenticación
async function getToken() {
  try {
    console.log('Obteniendo token...');
    
    const response = await axios.post(
      `https://${AUTH0_DOMAIN}/oauth/token`,
      {
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        audience: AUTH0_AUDIENCE,
        grant_type: 'client_credentials',
        scope: 'admin:zapatillas',
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    authToken = response.data.access_token;
    console.log('Token obtenido correctamente.');
    return authToken;
  } catch (error) {
    console.error('Error al obtener token:', error.message);
    process.exit(1);
  }
}

// Realizar petición autenticada
async function makeRequest(method, endpoint, data = null) {
  if (!authToken) {
    await getToken();
  }
  
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      method,
      url,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      ...(data && { data })
    };
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Error en ${method} ${endpoint}:`, error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}, Data:`, error.response.data);
    }
    return null;
  }
}

// Activar todas las zapatillas
async function activateAllZapatillas() {
  try {
    console.log('Obteniendo todas las zapatillas...');
    // Buscar todas las zapatillas, incluyendo las inactivas
    const zapatillas = await makeRequest('get', '/zapatillas?activa=false');
    
    console.log(`Se encontraron ${zapatillas.length} zapatillas inactivas.`);
    
    let activadas = 0;
    for (const zapatilla of zapatillas) {
      console.log(`Activando zapatilla ${zapatilla.id}: ${zapatilla.marca} ${zapatilla.modelo}`);
      
      try {
        await makeRequest('patch', `/zapatillas/${zapatilla.id}`, { activa: true });
        activadas++;
        console.log(`✅ Zapatilla ${zapatilla.id} activada con éxito`);
      } catch (err) {
        console.error(`❌ Error al activar zapatilla ${zapatilla.id}:`, err.message);
      }
      
      // Pequeña pausa para no sobrecargar
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`\n✅ Activadas ${activadas} de ${zapatillas.length} zapatillas inactivas`);
  } catch (error) {
    console.error('Error al activar zapatillas:', error.message);
  }
}

// Activar todas las tallas
async function activateAllTallas() {
  try {
    console.log('\nObteniendo todas las tallas...');
    // Buscar todas las relaciones zapatilla-tienda
    const ztRelations = await makeRequest('get', '/zapatillas-tienda');
    
    console.log(`Se encontraron ${ztRelations.length} relaciones zapatilla-tienda.`);
    
    let tallasInactivas = 0;
    let tallasActivadas = 0;
    
    for (const zt of ztRelations) {
      // Obtener todas las tallas de esta relación
      const tallas = await makeRequest('get', `/tallas?zapatilla_tienda_id=${zt.id}`);
      
      if (!tallas || tallas.length === 0) {
        console.log(`No hay tallas para zapatilla-tienda ${zt.id}`);
        continue;
      }
      
      const inactivas = tallas.filter(t => t.disponible === false);
      tallasInactivas += inactivas.length;
      
      if (inactivas.length > 0) {
        console.log(`Encontradas ${inactivas.length} tallas inactivas en ZT_ID=${zt.id}`);
        
        for (const talla of inactivas) {
          try {
            await makeRequest('patch', `/tallas/${talla.id}`, { disponible: true });
            tallasActivadas++;
            console.log(`✅ Talla ${talla.id} (${talla.talla}) activada con éxito`);
          } catch (err) {
            console.error(`❌ Error al activar talla ${talla.id}:`, err.message);
          }
          
          // Pequeña pausa para no sobrecargar
          await new Promise(r => setTimeout(r, 50));
        }
      }
    }
    
    console.log(`\n✅ Activadas ${tallasActivadas} de ${tallasInactivas} tallas inactivas`);
  } catch (error) {
    console.error('Error al activar tallas:', error.message);
  }
}

// Activar todas las relaciones zapatilla-tienda
async function activateAllZapatillaTienda() {
  try {
    console.log('\nVerificando relaciones zapatilla-tienda...');
    
    // Buscar todas las relaciones zapatilla-tienda
    const ztRelations = await makeRequest('get', '/zapatillas-tienda?disponible=false');
    
    console.log(`Se encontraron ${ztRelations.length} relaciones zapatilla-tienda inactivas.`);
    
    let activadas = 0;
    for (const zt of ztRelations) {
      console.log(`Activando zapatilla-tienda ${zt.id}`);
      
      try {
        await makeRequest('patch', `/zapatillas-tienda/${zt.id}`, { disponible: true });
        activadas++;
        console.log(`✅ Zapatilla-tienda ${zt.id} activada con éxito`);
      } catch (err) {
        console.error(`❌ Error al activar zapatilla-tienda ${zt.id}:`, err.message);
      }
      
      // Pequeña pausa para no sobrecargar
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`\n✅ Activadas ${activadas} de ${ztRelations.length} relaciones zapatilla-tienda inactivas`);
  } catch (error) {
    console.error('Error al activar relaciones zapatilla-tienda:', error.message);
  }
}

// Función principal
async function main() {
  try {
    await getToken();
    
    await activateAllZapatillas();
    await activateAllZapatillaTienda();
    await activateAllTallas();
    
    console.log('\n¡Proceso completado!');
  } catch (error) {
    console.error('Error en el proceso principal:', error.message);
  }
}

// Ejecutar script
main();
