# Language Learning Frontend

Aplicación web React para aprendizaje de idiomas con entrenamiento adaptativo y corrección automática con IA.

## Stack

- React 19
- TypeScript
- Vite
- React Router
- TanStack Query (React Query)
- Axios

## Instalación

1. Instalar dependencias:
```bash
npm install
```

2. El backend debe estar corriendo en `http://localhost:3000`

## Desarrollo

```bash
npm run dev
```

La aplicación se ejecutará en `http://localhost:5173`

## Scripts disponibles

- `npm run dev` - Ejecuta el servidor de desarrollo con hot reload
- `npm run build` - Compila el proyecto para producción
- `npm run preview` - Preview de la build de producción
- `npm run lint` - Ejecuta el linter

## Estructura del proyecto

```
frontend/
├── src/
│   ├── components/         # Componentes reutilizables (vacío por ahora)
│   ├── pages/             # Páginas de la aplicación
│   │   ├── LanguagesPage.tsx
│   │   ├── LanguageDetailPage.tsx
│   │   ├── TopicDetailPage.tsx
│   │   ├── TrainingPage.tsx
│   │   ├── EssaysPage.tsx
│   │   ├── VerbsPage.tsx
│   │   └── StatsPage.tsx
│   ├── services/          # Cliente API
│   │   └── api.ts
│   ├── types/             # Tipos de TypeScript
│   │   └── index.ts
│   ├── App.tsx            # Componente principal
│   ├── App.css            # Estilos globales
│   └── main.tsx           # Punto de entrada
├── package.json
└── vite.config.ts
```

## Funcionalidades implementadas

### 1. Gestión de idiomas
- Crear, ver y eliminar idiomas
- Ver estadísticas por idioma

### 2. Gestión de temarios
- Crear, ver y eliminar temarios
- Ver palabras por temario

### 3. Gestión de palabras
- Crear, ver y eliminar palabras
- Ver estadísticas de aprendizaje por palabra

### 4. Sistema de entrenamiento
- Modo "Por nivel": entrena palabras menos aprendidas primero
- Modo "Por temario": entrena palabras de un temario específico
- Validación en tiempo real
- Retroalimentación inmediata
- Resultados al finalizar

### 5. Redacciones con IA
- Crear redacciones
- Corrección automática con Claude API
- Ver errores detectados por tipo
- Feedback detallado

### 6. Estadísticas
- Estadísticas generales por idioma
- Actividad reciente (últimos 7 días)
- Palabras más difíciles
- Errores más comunes en redacciones

## Próximas mejoras

- Implementar creación de verbos en la UI
- Mejorar diseño con una biblioteca de UI (Material-UI, Chakra UI, etc.)
- Agregar animaciones y transiciones
- Implementar modo oscuro
- Agregar gráficos de progreso
- Exportar palabras/temarios
- Sistema de notificaciones
