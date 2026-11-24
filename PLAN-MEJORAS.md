# Plan de mejoras — LangLearn

Fecha: 2026-11-23. Estado de partida: app en local (backend Express + Prisma + PostgreSQL, frontend React + Vite), un solo usuario, 85 ficheros sin commitear desde el último commit ("Configure for Railway deployment").

Cada punto lleva: **diagnóstico** (qué pasa hoy y por qué), **propuesta** (qué cambiar), **alcance** (ficheros/áreas) y **esfuerzo** (S = una sesión corta, M = una tarde, L = varios días). Al final hay un orden sugerido y las decisiones que necesito de ti.

---

## 1. Sesiones equilibradas: 50 % repaso / 50 % nuevas, con tope diario

**Diagnóstico.** El pre-start de vocabulario mete *todos* los repasos pendientes más N nuevas (slider). Si hay 300 repasos, la sesión es 300 + 15: casi nada nuevo y una montaña de repaso. El tope no existe. Estructuras funciona igual (todas las due + N nuevas). Verbos es distinto (un verbo entero por sesión).

**Propuesta.**
- Un único control **"Tamaño de sesión"** (por defecto 30, recordado por idioma) en vez de "palabras nuevas".
- La sesión se compone **50/50**: mitad repasos, mitad nuevas (sin control de proporción, decisión del usuario). Si no hay suficientes de un lado, se rellena con el otro.
- Repasos: se eligen primero las **más atrasadas** y, a igualdad, las de **mayor nivel** (son las que más cuesta recuperar). Lo que no cabe espera sin penalización.
- Nuevas: del topic elegido, en el orden elegido (azar / antiguas / recientes).
- Mismo componente de pre-start para vocabulario y estructuras. En verbos, no aplica (ya es "un verbo por sesión"); solo se unifica el aspecto.
- Badge del sidebar: pasa a significar "repasos que entrarían hoy" (hasta el tope), con `+` si hay más (`30+`), en lugar del total crudo.

**Alcance.** `srsService.getDailyGlobal`, `structureSrsService.getDaily`, `dueCountsService`, pre-starts de `SrsTrainingPage`, `StructureSrsTrainingPage` (extraer a `SessionPreStart.tsx`).
**Esfuerzo.** M.

## 2. Volver tras días sin entrar: nunca más "424 para hoy"

**Diagnóstico.** Sin penalización (decisión correcta de octubre), los repasos no hechos se acumulan como "atrasados". Con el tope del punto 1 el problema de la sesión desaparece (la sesión siempre tiene 30), pero el *contador* seguiría diciendo 424 y la cola tardaría semanas en drenar. Ya añadimos un margen aleatorio (±15 %) al programar, que evita los picos futuros de una sesión grande.

**Propuesta.**
- **Re-escalonado automático** al abrir un idioma: si los atrasados superan `2 × tope` (p. ej. > 60), se reparten en los próximos `ceil(atrasados / tope)` días, de mayor a menor nivel, con el mismo algoritmo que usamos a mano en octubre (solo cambia `nextReviewAt`; se guarda copia para deshacer). Así el contador refleja algo hacible y la cola se absorbe sola.
- Opción en ajustes del idioma: tope diario de repasos (por defecto = tamaño de sesión).
- Pantalla final de sesión: "Mañana te esperan N" para que veas el horizonte.

**Alcance.** Nuevo `srsBacklogService` reutilizando `scripts/spreadOverdueBacklog.ts`; llamada en `dueCountsService.getForLanguage` (idempotente, una vez al día por idioma, con marca en `Language.lastRebalancedAt`). Migración pequeña.
**Esfuerzo.** S–M.

## 3. Estructuras: juzgar la frase, no compararla con la referencia

**Diagnóstico.** `StructureSrsTrainingPage` compara tu frase con la traducción de referencia (`isCorrect`: normaliza y compara). Cualquier frase correcta pero distinta cuenta como fallo, y acabas pulsando "Acerté" siempre. El objetivo real del ejercicio es *producir una frase válida que use la estructura* a partir de la pista en español.

**Propuesta.**
- Sustituir la comparación por un **juez IA** (Sonnet 5.5, ~0,003 $/frase) que recibe: estructura, pista en español, tu frase, y la referencia solo como orientación. Devuelve `valid` / `almost` / `invalid` + explicación corta + versión corregida.
  - `valid` → acierto, sube SRS.
  - `almost` (error menor de concordancia/ortografía) → acierto, pero se muestra la corrección en rojo/verde para que la leas.
  - `invalid` (no usa la estructura, o el sentido no es el de la pista) → reintento con la explicación.
- La referencia se muestra siempre después como "otra forma de decirlo", no como la única respuesta.
- "Acerté" se queda como override, pero deja de ser necesario. Ya existe `structureAiService.judgeVariant` (del flujo antiguo): se adapta en vez de crear otro.
- Registrar los veredictos para ver, por estructura, el % de `invalid` real.

**Alcance.** `structureAiService.judgeVariant` (prompt nuevo), endpoint `POST /structures/examples/:id/judge`, `StructureSrsTrainingPage` (flujo input → veredicto → corrección).
**Esfuerzo.** M.

## 4. Auditoría de módulos: qué se usa, qué sobra

**Diagnóstico (del código).**

| Módulo / página | Estado | Alcanzable desde el menú |
|---|---|---|
| Vocabulario (tabla + SRS) | activo | sí |
| Libros | activo | sí |
| Verbos (SRS "verbo del día") | activo | sí |
| Verbos — entrenar un verbo suelto (`VerbTrainingPage`) | antiguo | desde la tarjeta del verbo |
| Redacciones + gramática | activo | sí |
| Repaso de errores de redacción (`ErrorTrainingPage`) | antiguo | desde Redacciones |
| Estructuras | activo | sí |
| `TrainingPage` (entrenamiento por lotes/sesiones) | **sin ruta** (código muerto) | los botones de la página "Idiomas" apuntan a `/training`, que no existe |
| `TrainingSessionsPage` | **sin ruta** | no |
| `StatsPage` | **sin ruta** | botón "Estadísticas" en "Idiomas" apunta a `/stats`, que no existe |

**Propuesta.**
- Quitar los botones rotos de "Idiomas" y borrar las tres páginas sin ruta con sus endpoints (`trainingService`, `TrainingSessionSRS`, controladores de sesiones) si confirmas que no los usas.
- `VerbTrainingPage` y `ErrorTrainingPage`: decides tú (ver decisiones). Si se quedan, se les da el mismo aspecto que al resto.
- Estadísticas: no resucitar la página antigua; sustituirla por el panel "Hoy" del punto 6.

**Esfuerzo.** S (borrar) + lo que decidas conservar.

## 5. API externa para meter palabras desde un asistente

**Diagnóstico.** Hoy solo existe `POST /languages/:id/vocab/import`, sin autenticación y pensado para la UI.

**Propuesta.**
- Endpoints bajo `/api/v1/ext/*` protegidos con cabecera `X-API-Key` (variable `EXTERNAL_API_KEY`):
  - `GET /ext/languages` → `[{ code, name }]`
  - `GET /ext/topics?language=fr`
  - `POST /ext/words` → `{ language: "fr", topic?: "Vocabulario General", words: [{ term, definition }] }` → crea o reutiliza el topic, deduplica por término, devuelve `{ created, duplicates }`. Misma convención de artículos (`un/une`).
  - (opcional) `POST /ext/structures` con el mismo patrón.
- Documento `docs/API.md` con ejemplos `curl` y un párrafo listo para pegar en las instrucciones de tu asistente ("cuando te diga *palabras*, llama a…").
- Límite básico de peticiones y log de quién mete qué.
- Fase posterior: un **servidor MCP** mínimo que exponga `add_words` como herramienta, para que Claude/tu asistente lo use sin montar nada.

**Esfuerzo.** S (REST) + S (MCP).

## 6. Experiencia de uso: frontend

**Diagnóstico.** Cada módulo tiene su pre-start con controles distintos; al entrar a un idioma aterrizas en la tabla de vocabulario; no hay una vista de "qué me toca hoy"; algunas pantallas antiguas desentonan con el lector de libros (que ya tiene una tipografía y un ritmo cuidados).

**Propuesta, por orden de impacto.**
1. **Página "Hoy" por idioma** (nueva pantalla de entrada): repasos que entran hoy por módulo, nuevas sugeridas, un botón "Empezar" por módulo, racha de días y las 3 últimas sesiones. La tabla de vocabulario pasa a ser una pestaña, no la portada.
2. **Pre-start unificado** (tamaño, proporción, topic, orden) y **pantalla de sesión unificada** (barra con nuevas/repasos, atajos de teclado visibles, mismo tratamiento de acierto/fallo/reintento en vocab y estructuras).
3. **Tipografía y color** coherentes con el lector: serif en lo que se lee, sans en controles; modo oscuro.
4. **Tabla de vocabulario**: búsqueda instantánea, filtros por nivel/topic/atrasadas, edición en línea, y un script asistido por IA para **normalizar las entradas antiguas** a artículo indefinido (`la tartiflette` → `une tartiflette`).
5. **Móvil**: el lector y las sesiones deben funcionar en el teléfono si vas a usar la app desplegada desde él (hoy el lector está pensado para pantalla ancha).

**Esfuerzo.** L (en varias entregas; 1 y 2 primero).

## 7. Topic por defecto al añadir palabra

**Diagnóstico.** El formulario toma `topics[0]` y el backend ordena los topics por fecha de creación descendente, así que sale el último creado ("Madame Bovary (nuevo)").

**Propuesta.** Por defecto el topic llamado "Vocabulario General" (buscado por nombre, sin distinguir mayúsculas); si no existe, el más antiguo. Lo mismo en el importador. Recordar el último topic usado en la sesión del navegador.

**Esfuerzo.** S.

## 8. Publicar la app (Railway)

**Diagnóstico.** `package.json` raíz ya tiene `build`/`start` pensados para Railway y el backend sirve el `dist` del frontend; `start` ejecuta `prisma migrate deploy`. Falta lo esencial: **no hay autenticación**. Publicada tal cual, cualquiera que encuentre la URL puede usar (y pagar con tus claves) Anthropic, y borrar tus datos.

**Propuesta.**
0. Commit del estado actual + `.env.example` + `README` con arranque local.
1. **Acceso con usuario y contraseña**: tabla `User` (email, passwordHash bcrypt), `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`; cookie de sesión firmada (`httpOnly`, `secure` en producción, 30 días) con `SESSION_SECRET`; middleware que protege `/api/*` excepto `/health`, `/auth/*` y `/api/v1/ext/*` (que va con API key). Usuario inicial creado con `npm run create-user` (script interactivo). Sin registro público.
2. Railway: servicio Node desde la raíz (build/start existentes), plugin PostgreSQL, variables: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `EXTERNAL_API_KEY`, `BOOK_ANNOTATION_MODEL`, `NODE_ENV=production`.
3. Migrar datos: `pg_dump` local → `psql` Railway (los PDFs de los libros viven en la BD, viajan con ella).
4. Dominio propio opcional; HTTPS lo da Railway.
5. Copias de seguridad: `pg_dump` semanal automatizado.
6. Coste orientativo: plan Hobby ~5 $/mes + Postgres según uso (pequeño) + lo que consumas de IA (hoy ~0,02–0,03 $ por página de libro, céntimos por sesión).

**Esfuerzo.** M (auth) + S (despliegue) + S (migración de datos).

---

## Orden propuesto

1. **Rápidos** (una sesión): topic por defecto (7), botones rotos fuera y páginas muertas borradas (4), badge coherente. Topic por defecto, botones rotos fuera, páginas muertas borradas (incluido entrenamiento de verbo suelto).
2. **Sesiones 50/50 + tope + re-escalonado** (1 y 2). Es lo que más cambia tu día a día.
3. **Estructuras con juez IA** (3).
4. **Auth + commit + despliegue en Railway** (8). A partir de aquí ya lo usas desde cualquier sitio.
5. **API externa + doc** (5), y MCP si lo quieres.
6. **UX**: página "Hoy", pre-start/sesión unificados, tipografía, vocabulario, móvil (6).

Cada fase: yo diseño y reviso, Sonnet implementa, y verifico en el navegador antes de dártelo.

## Decisiones tomadas (2026-11-23)

1. **Módulos**: se conservan Redacciones y el repaso de errores de redacción. Se quitan: entrenamiento de un verbo suelto (`VerbTrainingPage` y su botón en la tarjeta), `TrainingPage`, `TrainingSessionsPage`, `StatsPage` y sus endpoints/servicios, y los botones rotos de "Idiomas".
2. **Sesión**: 30 ítems por defecto, reparto 50/50 fijo (sin control de proporción). Si falta de un lado se rellena con el otro.
3. **Estructuras**: `almost` cuenta como acierto y muestra la corrección.
4. **Móvil**: probablemente sí. La app debe funcionar bien en el teléfono (responsive real en sesiones, lector y menú); la optimización fina queda para la fase UX.
5. **Acceso**: usuario y contraseña (tabla `User`, hash bcrypt, cookie de sesión firmada). Un solo usuario al principio, creado por script/seed; sin registro público. Los datos siguen siendo globales (no se particionan por usuario): si algún día entra otra persona habrá que añadir `userId` a los datos.
6. **Dominio**: el de Railway (`*.up.railway.app`).
7. **Commit de seguridad** hecho antes de borrar nada (ver `git log`).
8. **Dictado**: módulo eliminado (2026-11-23). Las columnas `dictation*` de `Word` se borrarán en la misma migración que las tablas `TrainingSession*`.
