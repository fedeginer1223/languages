# Language Learning App

Aplicación fullstack para aprendizaje de idiomas con entrenamiento adaptativo, gestión de vocabulario y corrección automática de redacciones con IA.

## Características principales

- **Sistema de aprendizaje adaptativo**: Entrena las palabras que más necesitas practicar
- **Gestión de vocabulario**: Organiza palabras por idiomas y temarios
- **Corrección con IA**: Claude API corrige automáticamente tus redacciones
- **Estadísticas detalladas**: Seguimiento de tu progreso y áreas de mejora
- **Sistema de verbos**: Practica conjugaciones verbales
- **Validación estricta**: Respeta acentos e ignora mayúsculas/puntuación

## Stack Tecnológico

### Backend
- Node.js + Express + TypeScript
- PostgreSQL
- Prisma ORM
- Claude API (Anthropic)

### Frontend
- React 19 + TypeScript
- Vite
- React Router
- TanStack Query
- Axios
- Tailwind CSS
- Lucide Icons

## Design

The frontend features a modern, clean design with:
- **Sidebar Navigation**: Fixed sidebar with brand colors
- **Color Scheme**: Sky blue primary (#0284c7) with purple accents
- **Responsive**: Mobile-first design with hamburger menu
- **Components**: Custom UI components with Tailwind CSS
- **Icons**: Lucide React icons throughout

See [DESIGN.md](./DESIGN.md) for complete design system documentation.

## Estructura del proyecto

```
languages/
├── backend/               # API REST
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── types/
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
├── frontend/              # Aplicación React
│   ├── src/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── types/
│   │   └── App.tsx
│   └── package.json
├── database-schema.md     # Documentación del modelo de datos
└── api-endpoints.md       # Documentación de la API
```

## Instalación y configuración

### 1. Configurar PostgreSQL

```bash
# Crear base de datos
createdb language_learning
```

### 2. Backend

```bash
cd backend

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Ejecutar migraciones
npm run prisma:migrate

# Iniciar servidor de desarrollo
npm run dev
```

El backend se ejecutará en `http://localhost:3000`

### 3. Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

El frontend se ejecutará en `http://localhost:5173`

## Variables de entorno

### Backend (.env)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/language_learning?schema=public"
PORT=3000
NODE_ENV=development
ANTHROPIC_API_KEY=your_api_key_here
```

## Funcionalidades implementadas

### 1. Gestión de idiomas y temarios
- CRUD completo de idiomas
- CRUD completo de temarios
- Organización jerárquica de contenido

### 2. Sistema de palabras
- Crear, editar y eliminar palabras
- Término y definición por palabra
- Estadísticas de aprendizaje (intentos, aciertos, porcentaje)

### 3. Modos de entrenamiento

#### Por nivel de aprendizaje
- Ordena palabras por estadísticas
- Prioriza palabras menos aprendidas
- Incluye palabras nuevas después

#### Por temario
- Entrena palabras de un temario específico
- Ordena por dificultad dentro del temario

#### Validación estricta
- Respeta acentos (gusto ≠ gustó)
- Ignora mayúsculas/minúsculas
- Ignora puntuación al final
- Respeta orden exacto de letras

### 4. Sistema de verbos
- CRUD de verbos con conjugaciones
- Múltiples tiempos verbales
- Estadísticas por conjugación
- Práctica específica por tiempos seleccionados

### 5. Redacciones con IA
- Corrección automática con Claude API
- Detección de errores:
  - Acentos
  - Gramática
  - Ortografía
  - Otros
- Feedback detallado por error
- Conversión de errores en palabras para practicar

### 6. Estadísticas completas
- Resumen general por idioma
- Actividad reciente (últimos 7 días)
- Palabras más difíciles
- Errores más comunes en redacciones
- Porcentajes de acierto

## API Endpoints

Ver documentación completa en `api-endpoints.md`

### Principales endpoints:

```
# Idiomas
GET    /api/v1/languages
POST   /api/v1/languages
GET    /api/v1/languages/:id
PUT    /api/v1/languages/:id
DELETE /api/v1/languages/:id

# Temarios
GET    /api/v1/languages/:languageId/topics
POST   /api/v1/languages/:languageId/topics
GET    /api/v1/topics/:id
PUT    /api/v1/topics/:id
DELETE /api/v1/topics/:id

# Palabras
GET    /api/v1/topics/:topicId/words
POST   /api/v1/topics/:topicId/words
POST   /api/v1/topics/:topicId/words/batch
GET    /api/v1/words/:id
PUT    /api/v1/words/:id
DELETE /api/v1/words/:id

# Entrenamiento
GET    /api/v1/training/session
POST   /api/v1/training/validate

# Verbos
GET    /api/v1/languages/:languageId/verbs
POST   /api/v1/languages/:languageId/verbs
GET    /api/v1/verbs/:id
GET    /api/v1/verbs/:id/practice
POST   /api/v1/verbs/conjugations/:id/validate

# Redacciones
GET    /api/v1/languages/:languageId/essays
POST   /api/v1/languages/:languageId/essays
GET    /api/v1/essays/:id
DELETE /api/v1/essays/:id
POST   /api/v1/essays/:id/errors/:errorId/convert

# Estadísticas
GET    /api/v1/stats/languages/:languageId
GET    /api/v1/stats/errors
```

## Modelo de datos

Ver documentación completa en `database-schema.md`

### Entidades principales:

- **Languages**: Idiomas que el usuario está aprendiendo
- **Topics**: Temarios que agrupan palabras
- **Words**: Palabras con término, definición y estadísticas
- **Verbs**: Verbos con sus conjugaciones
- **VerbConjugations**: Conjugaciones de verbos con estadísticas
- **Essays**: Redacciones del usuario
- **EssayCorrections**: Correcciones automáticas con IA
- **Errors**: Errores detectados en redacciones

## Próximas mejoras

- Implementar creación de verbos en la UI
- Sistema de spaced repetition (SRS)
- Modo de práctica con flashcards
- Gamificación (rachas, logros, niveles)
- Exportar/importar datos
- Práctica de conjugaciones verbales en el frontend
- Modo oscuro
- Gráficos de progreso
- Sistema de notificaciones
- Adaptación a móvil (React Native)

## Contribuir

Este proyecto está en desarrollo activo. Para contribuir:

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## Licencia

MIT
