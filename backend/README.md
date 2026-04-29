# Language Learning Backend API

API REST para la aplicación de aprendizaje de idiomas.

## Stack

- Node.js + TypeScript
- Express
- PostgreSQL
- Prisma ORM
- Claude API (Anthropic)

## Instalación

1. Instalar dependencias:
```bash
npm install
```

2. Configurar variables de entorno:
```bash
cp .env.example .env
```

Edita `.env` y configura:
- `DATABASE_URL`: URL de conexión a PostgreSQL
- `ANTHROPIC_API_KEY`: Tu API key de Claude
- `PORT`: Puerto del servidor (default: 3000)

3. Ejecutar migraciones de Prisma:
```bash
npm run prisma:generate
npm run prisma:migrate
```

## Desarrollo

```bash
npm run dev
```

El servidor se ejecutará en `http://localhost:3000`

## Scripts disponibles

- `npm run dev` - Ejecuta el servidor en modo desarrollo con hot reload
- `npm run build` - Compila el proyecto TypeScript
- `npm start` - Ejecuta el servidor en producción
- `npm run prisma:generate` - Genera el cliente de Prisma
- `npm run prisma:migrate` - Ejecuta las migraciones de base de datos
- `npm run prisma:studio` - Abre Prisma Studio para ver la base de datos

## Estructura del proyecto

```
backend/
├── prisma/
│   └── schema.prisma          # Esquema de la base de datos
├── src/
│   ├── controllers/           # Controladores de rutas
│   ├── routes/               # Definición de rutas
│   ├── services/             # Lógica de negocio
│   ├── middleware/           # Middleware de Express
│   ├── utils/                # Utilidades (Prisma, validación)
│   ├── types/                # Tipos de TypeScript
│   └── index.ts              # Punto de entrada
├── package.json
└── tsconfig.json
```

## API Endpoints

Ver documentación completa en `../api-endpoints.md`

### Principales endpoints:

- `GET /api/v1/languages` - Listar idiomas
- `POST /api/v1/languages` - Crear idioma
- `GET /api/v1/languages/:id/topics` - Listar temarios de un idioma
- `POST /api/v1/languages/:id/topics` - Crear temario
- `GET /api/v1/topics/:id/words` - Listar palabras de un temario
- `POST /api/v1/topics/:id/words` - Crear palabra
- `GET /api/v1/training/session` - Iniciar sesión de entrenamiento
- `POST /api/v1/training/validate` - Validar respuesta
- `POST /api/v1/languages/:id/essays` - Crear y corregir redacción
- `GET /api/v1/stats/languages/:id` - Obtener estadísticas

## Características implementadas

### 1. Sistema de palabras
- CRUD completo de palabras
- Estadísticas de aprendizaje (attempts, correctCount, successRate)
- Ordenamiento por nivel de aprendizaje

### 2. Sistema de entrenamiento
- Modo "by-level": palabras menos aprendidas primero
- Modo "by-topic": entrenar palabras de un temario específico
- Validación estricta (respeta acentos, ignora mayúsculas/puntuación)

### 3. Sistema de verbos
- CRUD de verbos con conjugaciones
- Práctica de conjugaciones por tiempo verbal
- Estadísticas por conjugación

### 4. Sistema de redacciones
- Corrección automática con Claude API
- Detección de errores de acentos, gramática y ortografía
- Conversión de errores en palabras para practicar

### 5. Estadísticas
- Estadísticas por idioma
- Palabras más difíciles
- Actividad reciente (últimos 7 días)
- Estadísticas de errores más comunes
