# Plan: Supabase y Vercel para Agencia IA CRM

## Meta

Mantener Next.js y Drizzle, alojar PostgreSQL y archivos de forma persistente en Supabase, y desplegar la aplicación en Vercel. La migración debe conservar cuentas, contactos, mensajes, citas y credenciales cifradas de los canales.

## Recomendación para que cargue más rápido

La lentitud que se vio en el equipo local fue, en parte, de desarrollo: `next dev` compila una ruta cuando se visita por primera vez. El registro del servidor mostró una compilación inicial de `/login` de alrededor de 13 segundos. El proceso anterior también alcanzó el límite de memoria que tenía y se cerró; se reinició con 2 GB para reducir ese problema.

Para trabajar:

1. Mantener `pnpm dev` para editar y usar la ruta ya compilada al volver a visitarla.
2. Para evaluar la velocidad real, usar una compilación de producción (`pnpm build` y luego `pnpm start`) o la URL Preview de Vercel. No medir el primer render de `next dev` como si fuera producción.
3. Si las pantallas siguen lentas después del primer render, medir por separado la llamada del navegador, las consultas a PostgreSQL y los servicios externos (Meta, Zernio y el proveedor de IA). Optimizar la llamada que resulte lenta; no cachear información privada de cada organización.
4. Desplegar las funciones de Vercel cerca de la base de datos. Para esta instancia orientada a Ecuador, empezar con São Paulo: Supabase `sa-east-1` y Vercel `gru1` están en esa región. Comparar los tiempos de respuesta desde Ecuador antes de fijar producción.

Antes de generar la compilación de producción, corregir el bloqueo actual de TypeScript: `pnpm typecheck` se detiene en `vitest.config.ts` por una incompatibilidad de tipos de Vitest/esbuild. Resolverlo sin desactivar la comprobación de tipos de la aplicación.

## Fase 1: preparar Supabase sin cambiar producción

1. Crear un proyecto de Supabase de staging en São Paulo (`sa-east-1`).
2. Crear una contraseña fuerte para PostgreSQL y guardar los secretos fuera del repositorio.
3. Mantener Drizzle como acceso a PostgreSQL y Better Auth como autenticación. No introducir Supabase Auth en esta migración: duplicaría las sesiones y los usuarios del CRM.
4. Aplicar las migraciones de `drizzle/` a la base vacía. Para las migraciones usar la conexión directa de Supabase, que es el modo indicado para operaciones de mantenimiento.
5. Adaptar el cliente de `src/lib/db/index.ts` para separar el modo persistente local del modo serverless. En Vercel usar el pool transaccional de Supabase, pool por instancia pequeño (empezar con `max: 1`), SSL y las opciones que exige el pooler (`prepare: false` y compatibilidad de pipelining/prefetch verificada). No usar la conexión directa desde cada función de Vercel.
6. Revisar el ajuste de zona horaria. El código actual depende de UTC para sus columnas `timestamp`; con pool transaccional no se debe depender de estado de sesión que pueda cambiar entre consultas. Configurar UTC a nivel de base/rol y verificar escrituras y lecturas de fechas.

**Aceptación:** la aplicación puede abrir una sesión, registrar un usuario de prueba, leer y escribir datos con Drizzle, y ejecutar todas las migraciones sin depender de la base local.

## Fase 2: trasladar datos existentes

1. Hacer una copia de seguridad de PostgreSQL local y comprobar que contiene las tablas y filas esperadas.
2. Guardar, sin publicar ni enviar por chat, la misma `ENCRYPTION_KEY` que cifra las credenciales de WhatsApp, Facebook, Instagram y otros canales. Si se cambia, los valores cifrados actuales ya no se podrán descifrar.
3. Importar los datos a Supabase después de crear el esquema. Verificar conteos por tabla, usuarios/membresías, contactos, conversaciones, mensajes, etapas, citas y credenciales. No copiar roles internos del servidor local.
4. Mantener la base original intacta hasta cerrar la validación de staging y tener respaldo confirmado.
5. La clave `BETTER_AUTH_SECRET` también debe mantenerse estable durante la migración. Al cambiar el dominio, es posible que los usuarios deban iniciar sesión de nuevo.

**Aceptación:** una cuenta existente entra en staging y ve sus propios datos y conexiones; una organización no puede consultar los datos de otra.

## Fase 3: compatibilidad con funciones serverless

Vercel inicia instancias bajo demanda y no garantiza que dos solicitudes lleguen al mismo proceso. Hay tres piezas actuales que dependen de que el proceso siga vivo:

1. **Adjuntos y logos:** `src/server/whatsapp/media.ts` escribe en `MEDIA_DIR`. Cambiar esa capa para usar un bucket privado de Supabase Storage y guardar en PostgreSQL solo la ruta/clave del objeto. Descargar mediante rutas autenticadas o URLs firmadas. Migrar también los logos/favicon guardados en disco.
2. **Eventos en vivo:** `src/server/events/bus.ts` usa un `EventEmitter` de memoria y `/api/events` mantiene SSE en el mismo proceso. En Vercel, el proceso que publica un evento puede ser distinto al que sostiene SSE. Sustituirlo por Supabase Realtime con control de organización o por sondeo autenticado como primera versión.
3. **Agente y trabajos diferidos:** `src/server/ai/pipeline.ts` usa `setTimeout` y memoria local para agrupar turnos; el registro de comentarios también se actualiza solo mientras la página está abierta. Pasar el trabajo a un mecanismo durable con idempotencia. Para la primera versión se puede procesar dentro del webhook/request con una duración configurada y controlada; para ejecuciones confiables en segundo plano, agregar una cola/worker que sobreviva al cierre de la función.
4. **Archivos de medios de WhatsApp:** mover fotos, audios, documentos y videos al mismo adaptador de almacenamiento. El sistema actual permite archivos mayores a los límites cómodos de una subida estándar; usar subidas reanudables o carga directa firmada para objetos grandes.
5. **Rutas de API:** usar runtime Node.js (no Edge) donde se necesiten `postgres`, `node:fs`, criptografía del servidor o SDKs Node. Añadir duración máxima solo a rutas que lo necesiten —webhooks y tareas de agente— y comprobar los límites del plan de Vercel elegido.

**Aceptación:** después de reiniciar una función, los archivos siguen disponibles; los eventos aparecen aunque el publicador y el navegador estén en instancias diferentes; un webhook entrante no pierde el turno del agente.

## Fase 4: desplegar primero Preview en Vercel

1. Conectar el repositorio Git a Vercel y dejar que detecte Next.js. Usar `pnpm` según `pnpm-lock.yaml`.
2. Añadir `vercel.json` con la región inicial `gru1` para acercar las funciones a Supabase. Los archivos estáticos seguirán entregándose por la CDN de Vercel.
3. Configurar variables en Preview y Production por separado:
   - Obligatorias: `APP_BASE_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `META_WEBHOOK_VERIFY_TOKEN`.
   - Según funciones activadas: `CHANNELS`, `OPENROUTER_API_TOKEN`, `OPENROUTER_MODEL`, `META_APP_SECRET`, `AGENDA`, `ATRIBUCION` y credenciales de servicios externos.
4. En Preview, `APP_BASE_URL` debe ser la URL HTTPS del deployment Preview que se usará para la prueba. En producción debe ser el dominio definitivo.
5. Ejecutar migraciones una sola vez desde un paso controlado de despliegue/CI con una URL directa de mantenimiento. No ejecutar migraciones al iniciar cada función serverless.
6. Validar registro/inicio de sesión, equipo, contactos, conversaciones, mensajes entrantes y salientes, carga de medios, comentarios, agente, agenda, branding y aislamiento de organizaciones.
7. Configurar en Meta y Zernio las URLs HTTPS públicas de webhooks para WhatsApp, Messenger e Instagram. Probar verificación y entrega real de cada evento.
8. Revisar logs, latencia, uso de conexiones, consumo de funciones y almacenamiento antes de promover Preview a Production.

**Aceptación:** Preview funciona con una base y credenciales de prueba sin leer datos de producción. Producción se despliega solo después de validar la copia de datos y todos los webhooks.

## Fase 5: velocidad después de publicar

1. Medir desde Ecuador: tiempo hasta el primer contenido, primera consulta de bandeja y respuesta de las rutas API.
2. Mantener páginas con información de organización dinámicas y privadas; cachear únicamente recursos públicos como JS, CSS, imágenes públicas y páginas públicas de marketing.
3. Bajar el volumen de consultas repetidas en bandeja y comentarios, usar paginación para historiales largos y reducir el tamaño de archivos enviados al navegador.
4. Vigilar la cantidad de conexiones en Supabase y el tiempo de cada función en Vercel. Ajustar el pool solo con datos de concurrencia y cola.

## Decisiones que faltan antes de ejecutar la migración

- Crear las cuentas/proyectos de Supabase y Vercel bajo las cuentas del propietario.
- Elegir si se migra el contenido actual o se inicia con una base vacía.
- Definir el dominio final que recibirá los webhooks HTTPS.
- Decidir si la primera versión usará sondeo para bandeja/eventos o si se incluye desde el inicio Realtime y una cola durable.

## Referencias oficiales

- [Conexión de Supabase a PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Drizzle con Supabase](https://supabase.com/docs/guides/database/drizzle)
- [Regiones de Supabase](https://supabase.com/docs/guides/platform/regions)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Next.js en Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Regiones de Vercel](https://vercel.com/docs/regions)
- [Duración de Vercel Functions](https://vercel.com/docs/functions/configuring-functions/duration)
