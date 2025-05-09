# Guía de Uso: Herramientas para Solucionar Problema de Disponibilidad

## Introducción

Este documento proporciona instrucciones detalladas sobre cómo utilizar las herramientas desarrolladas para solucionar el problema de disponibilidad en el Scraper Quimera. Estas herramientas permiten asegurar que todas las zapatillas y tallas estén marcadas como `disponible = true` en la base de datos.

## Requisitos Previos

- Node.js instalado (v14 o superior)
- Variables de entorno configuradas en `.env` (copiar desde `.env.example` si es necesario)
- Acceso a la API (credenciales de Auth0 configuradas)

## Herramientas Disponibles

### 1. Solución Completa (`fix-zapatillas-completo.js`)

Esta es la herramienta principal y más completa. Ofrece varias funcionalidades:

- Verificación y reparación de inconsistencias en la base de datos
- Análisis detallado por tienda
- Generación de informes

#### Uso:

```bash
# Verificar y reparar todas las inconsistencias
node fix-zapatillas-completo.js

# Verificar y reparar (mismo que anterior)
node fix-zapatillas-completo.js --fix

# Analizar una tienda específica
node fix-zapatillas-completo.js --analizar 1

# Analizar todas las tiendas
node fix-zapatillas-completo.js --analizar-todas
```

### 2. Activación de Zapatillas (`activar-zapatillas.js`)

Esta herramienta se enfoca específicamente en activar zapatillas y tallas (establecer `disponible = true`).

#### Uso:

```bash
# Activar zapatillas para todas las tiendas
node activar-zapatillas.js

# Activar zapatillas para una tienda específica
node activar-zapatillas.js --tienda 1
```

### 3. Corrección Rápida (`fix-disponibilidad.js`)

Esta es una solución rápida y simple que actualiza todos los registros existentes a `disponible = true`.

#### Uso:

```bash
# Corregir disponibilidad en toda la base de datos
node fix-disponibilidad.js
```

## Ejemplo de Flujo de Trabajo Recomendado

1. **Análisis inicial**:
   ```bash
   node fix-zapatillas-completo.js --analizar-todas
   ```

2. **Corrección completa**:
   ```bash
   node fix-zapatillas-completo.js
   ```

3. **Verificación de corrección**:
   ```bash
   node fix-zapatillas-completo.js --analizar-todas
   ```

4. **Ejecución del scraper** (para verificar que el problema está resuelto)

5. **Verificación final**:
   ```bash
   node fix-zapatillas-completo.js --analizar 1
   ```

## Interpretación de los Resultados

### Análisis de Disponibilidad

Cuando ejecutas el análisis (`--analizar`), obtendrás información como:

```
Total zapatillas: 150
Zapatillas disponibles: 30 (20%)
Zapatillas no disponibles: 120 (80%)
```

Un porcentaje bajo de zapatillas disponibles (como en el ejemplo) indica que el problema persiste. Después de aplicar la corrección, deberías ver:

```
Total zapatillas: 150
Zapatillas disponibles: 150 (100%)
Zapatillas no disponibles: 0 (0%)
```

### Informe de Reparación

Al ejecutar la corrección completa, se genera un archivo `informe-reparacion.json` con estadísticas detalladas:

```json
{
  "fecha": "2023-05-09T12:34:56.789Z",
  "totalZapatillas": 300,
  "totalRelaciones": 450,
  "totalTallas": 1800,
  "relacionesActivadas": 420,
  "tallasActivadas": 1750,
  "zapatillasSinRelaciones": 5,
  "relacionesSinTallas": 3
}
```

## Solución de Problemas

Si encuentras errores al ejecutar los scripts:

1. **Problemas de autenticación**:
   - Verifica las credenciales en el archivo `.env`
   - Asegúrate de que el cliente de Auth0 tenga los permisos adecuados

2. **Error "Cannot read property 'id' of undefined"**:
   - Indica un problema al acceder a un objeto que no existe
   - Verifica la existencia de la tienda o zapatilla específica

3. **Errores de conexión a la API**:
   - Verifica que la URL base sea correcta en `.env`
   - Asegúrate de que la API esté en ejecución

## Mantenimiento Continuo

Para evitar que el problema resurja en el futuro:

1. Ejecuta el script de análisis periódicamente (semanal o mensualmente)
2. Considera agregar el script de corrección como parte de tu proceso de CI/CD
3. Implementa monitoreo para detectar rápidamente si el problema vuelve a ocurrir

## Soporte

Si encuentras problemas adicionales, contacta al equipo de desarrollo.

---

Documento creado el 9 de mayo de 2023
