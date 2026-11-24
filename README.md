# LangLearn

App de aprendizaje de idiomas (vocabulario, verbos, estructuras, libros y redacciones) con repaso espaciado (SRS) y corrección con IA. Backend Express + Prisma + PostgreSQL, frontend React + Vite. Acceso protegido con usuario y contraseña (un solo usuario, sin registro público).

## Arranque local

1. Arranca un PostgreSQL local y crea la base de datos `language_learning`.
2. Copia `backend/.env.example` a `backend/.env` y rellena los valores.
3. Instala dependencias: `npm install` en la raíz, en `backend/` y en `frontend/`.
4. Aplica las migraciones: `cd backend && npx prisma migrate dev`.
5. Crea tu usuario: `cd backend && npm run create-user` (pide email y contraseña; también acepta `--email` y `--password`, o `ADMIN_EMAIL`/`ADMIN_PASSWORD`).
6. Arranca todo: `npm run dev` en la raíz (backend en `:3002`, frontend en Vite con proxy a `/api`).

## Variables de entorno (`backend/.env`)

| Nombre | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL |
| `SESSION_SECRET` | Sí en producción | Firma de la cookie de sesión (JWT). Cadena larga y aleatoria |
| `PORT` | No | Puerto del servidor (por defecto 3002; Railway lo inyecta) |
| `NODE_ENV` | No | `production` activa cookie `secure` y exige `SESSION_SECRET` |
| `ANTHROPIC_API_KEY` | Sí | Corrección de redacciones, anotación de libros, juez de estructuras |
| `BOOK_ANNOTATION_MODEL` | No | Modelo para anotar libros |
| `STRUCTURE_JUDGE_MODEL` | No | Modelo para juzgar traducciones de estructuras |
| `EXTERNAL_API_KEY` | No | Clave de la API externa (`/api/v1/ext/*`, cabecera `X-API-Key`); vacía = desactivada |

## Despliegue en Railway

1. Crea un proyecto en Railway desde este repositorio (usa `railway.json`: build `npm run build`, start `npm run start`, healthcheck `/health`).
2. Añade el plugin PostgreSQL y enlaza `DATABASE_URL` al servicio (referencia `${{Postgres.DATABASE_URL}}`).
3. Define las variables: `SESSION_SECRET`, `NODE_ENV=production`, `ANTHROPIC_API_KEY` y el resto que uses.
4. El arranque ejecuta `prisma migrate deploy` automáticamente.
5. Crea el usuario: `railway run npm run create-user --prefix backend`, o en local con la `DATABASE_URL` pública de Railway:
   `DATABASE_URL="<url-railway>" npm run create-user --prefix backend`.
6. Migrar los datos locales a Railway:

```bash
pg_dump --no-owner --no-acl --data-only --exclude-table=users "$LOCAL_DATABASE_URL" > datos.sql
# primero deja que Railway aplique las migraciones (primer despliegue), luego:
psql "$RAILWAY_DATABASE_URL" < datos.sql
```

API externa para apuntar vocabulario desde un asistente (ChatGPT/Claude): ver [`docs/API.md`](docs/API.md).
