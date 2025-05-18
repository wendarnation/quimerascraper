// src/scripts/test-footdistrict-scraper.ts
import { FootdistrictScraper } from '../scraper/tiendas/footdistrict-scraper';
import { TiendaInfo } from '../scraper/interfaces/quimera-scraper.interface';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script para probar el scraper de Footdistrict directamente
 */
async function main() {
  console.log('Iniciando prueba del scraper para Footdistrict...');

  // Crear instancia de scraper con información de prueba
  const tiendaInfo: TiendaInfo = {
    id: 999, // ID para pruebas
    nombre: 'Footdistrict',
    url: 'https://footdistrict.com/',
    pais: 'ES',
    moneda: 'EUR',
  };

  try {
    const scraper = new FootdistrictScraper(tiendaInfo);
    
    // Configurar opciones específicas para pruebas
    scraper.setOptions({
      headless: false, // Cambiar a true para ejecutar sin interfaz
      maxItems: 3, // Limitar a 3 productos para pruebas
      proxyUrl: null, // Configurar proxy si es necesario
      stealth: true, // Modo sigiloso anti-detección
    });

    console.log('Ejecutando scraper...');
    const zapatillas = await scraper.scrapeZapatillas();

    console.log(`Se obtuvieron ${zapatillas.length} productos.`);

    // Guardar los resultados en un archivo JSON para análisis
    const outputDir = path.join(__dirname, '../../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, `footdistrict_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(zapatillas, null, 2), 'utf8');

    console.log(`Resultados guardados en: ${outputFile}`);

    // Imprimir un resumen
    console.log('\nResumen de productos extraídos:');
    zapatillas.forEach((z, i) => {
      console.log(`\nProducto ${i + 1}:`);
      console.log(`  Marca: ${z.marca}`);
      console.log(`  Modelo: ${z.modelo}`);
      console.log(`  SKU: ${z.sku}`);
      console.log(`  Precio: ${z.precio}`);
      console.log(`  Tallas disponibles: ${z.tallas.filter(t => t.disponible).length}/${z.tallas.length}`);
      console.log(`  URL: ${z.url_producto}`);
    });

  } catch (error) {
    console.error('Error al ejecutar el scraper:', error);
    process.exit(1);
  }
}

// Ejecutar la función principal
main().catch(console.error);
