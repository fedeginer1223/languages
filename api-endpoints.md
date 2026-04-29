# API Endpoints - Language Learning App

## Base URL
`http://localhost:3000/api/v1`

---

## 1. Languages (Idiomas)

### GET /languages
Obtener todos los idiomas
```json
Response 200:
[
  {
    "id": "uuid",
    "name": "Español",
    "code": "es",
    "createdAt": "2024-01-01T00:00:00Z",
    "stats": {
      "topicsCount": 5,
      "wordsCount": 150,
      "avgSuccessRate": 75.5
    }
  }
]
```

### POST /languages
Crear un nuevo idioma
```json
Request:
{
  "name": "Español",
  "code": "es"
}

Response 201:
{
  "id": "uuid",
  "name": "Español",
  "code": "es",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### GET /languages/:id
Obtener un idioma específico con estadísticas

### PUT /languages/:id
Actualizar un idioma

### DELETE /languages/:id
Eliminar un idioma (y todo su contenido)

---

## 2. Topics (Temarios)

### GET /languages/:languageId/topics
Obtener todos los temarios de un idioma
```json
Response 200:
[
  {
    "id": "uuid",
    "name": "Verbos irregulares",
    "description": "Los verbos más difíciles",
    "wordsCount": 45,
    "avgSuccessRate": 68.3,
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

### POST /languages/:languageId/topics
Crear un nuevo temario
```json
Request:
{
  "name": "Verbos irregulares",
  "description": "Los verbos más difíciles"
}

Response 201:
{
  "id": "uuid",
  "name": "Verbos irregulares",
  "description": "Los verbos más difíciles",
  "languageId": "uuid",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### GET /topics/:id
Obtener un temario específico con todas sus palabras

### PUT /topics/:id
Actualizar un temario

### DELETE /topics/:id
Eliminar un temario (y todas sus palabras)

---

## 3. Words (Palabras)

### GET /topics/:topicId/words
Obtener todas las palabras de un temario
```json
Query params:
- sortBy: "learning" | "recent" | "alphabetical" (default: "learning")
- limit: number (default: 50)
- offset: number (default: 0)

Response 200:
[
  {
    "id": "uuid",
    "term": "hablar",
    "definition": "to speak",
    "attempts": 10,
    "correctCount": 7,
    "successRate": 70.0,
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

### POST /topics/:topicId/words
Crear una nueva palabra
```json
Request:
{
  "term": "hablar",
  "definition": "to speak"
}

Response 201:
{
  "id": "uuid",
  "term": "hablar",
  "definition": "to speak",
  "attempts": 0,
  "correctCount": 0,
  "successRate": 0,
  "topicId": "uuid",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### POST /topics/:topicId/words/batch
Crear múltiples palabras a la vez
```json
Request:
{
  "words": [
    { "term": "hablar", "definition": "to speak" },
    { "term": "comer", "definition": "to eat" }
  ]
}

Response 201:
{
  "created": 2,
  "words": [...]
}
```

### GET /words/:id
Obtener una palabra específica

### PUT /words/:id
Actualizar una palabra

### DELETE /words/:id
Eliminar una palabra

---

## 4. Training (Entrenamiento)

### GET /training/session
Iniciar una sesión de entrenamiento
```json
Query params:
- mode: "by-level" | "by-topic" (required)
- topicId: string (required if mode="by-topic")
- languageId: string (required if mode="by-level")
- limit: number (default: 20)

Response 200:
{
  "sessionId": "uuid",
  "mode": "by-level",
  "totalQuestions": 20,
  "questions": [
    {
      "id": "uuid",
      "wordId": "uuid",
      "definition": "to speak",
      "order": 1
    }
  ]
}
```

### POST /training/validate
Validar una respuesta
```json
Request:
{
  "sessionId": "uuid",
  "wordId": "uuid",
  "answer": "hablar"
}

Response 200:
{
  "correct": true,
  "expectedAnswer": "hablar",
  "explanation": null, // o mensaje si está incorrecto
  "stats": {
    "attempts": 11,
    "correctCount": 8,
    "successRate": 72.7
  }
}
```

---

## 5. Verbs (Verbos)

### GET /languages/:languageId/verbs
Obtener todos los verbos de un idioma

### POST /languages/:languageId/verbs
Crear un nuevo verbo
```json
Request:
{
  "infinitive": "hablar",
  "conjugations": [
    {
      "tense": "presente",
      "person": "yo",
      "form": "hablo"
    },
    {
      "tense": "presente",
      "person": "tú",
      "form": "hablas"
    }
  ]
}

Response 201:
{
  "id": "uuid",
  "infinitive": "hablar",
  "languageId": "uuid",
  "conjugations": [...]
}
```

### GET /verbs/:id
Obtener un verbo con todas sus conjugaciones

### PUT /verbs/:id
Actualizar un verbo

### DELETE /verbs/:id
Eliminar un verbo

### GET /verbs/:id/practice
Obtener preguntas de práctica para un verbo
```json
Query params:
- tenses: string[] (ej: ["presente", "pretérito"])

Response 200:
{
  "verbId": "uuid",
  "infinitive": "hablar",
  "questions": [
    {
      "conjugationId": "uuid",
      "tense": "presente",
      "person": "yo",
      "prompt": "hablar (presente, yo)"
    }
  ]
}
```

### POST /verbs/conjugations/:id/validate
Validar una conjugación

---

## 6. Essays (Redacciones)

### GET /languages/:languageId/essays
Obtener todas las redacciones de un idioma

### POST /languages/:languageId/essays
Crear y corregir una nueva redacción
```json
Request:
{
  "title": "Mi primer día en España",
  "text": "Ayer fui a la playa y vi muchos peces. Me gusto mucho."
}

Response 201:
{
  "id": "uuid",
  "title": "Mi primer día en España",
  "originalText": "Ayer fui a la playa...",
  "languageId": "uuid",
  "correction": {
    "id": "uuid",
    "correctedText": "Ayer fui a la playa y vi muchos peces. Me gustó mucho.",
    "feedback": "En general está bien escrito. Hay un error de acentuación.",
    "errors": [
      {
        "id": "uuid",
        "errorType": "accent",
        "original": "gusto",
        "corrected": "gustó",
        "explanation": "El verbo gustar en pasado lleva acento en la última sílaba: gustó",
        "position": 45
      }
    ]
  },
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### GET /essays/:id
Obtener una redacción con su corrección

### DELETE /essays/:id
Eliminar una redacción

### POST /essays/:id/errors/:errorId/convert
Convertir un error en una palabra para practicar
```json
Request:
{
  "topicId": "uuid" // ID del temario de errores o cualquier otro
}

Response 201:
{
  "word": {
    "id": "uuid",
    "term": "gustó",
    "definition": "pretérito de gustar (tercera persona singular)",
    "topicId": "uuid"
  }
}
```

---

## 7. Statistics (Estadísticas)

### GET /languages/:languageId/stats
Obtener estadísticas generales de un idioma
```json
Response 200:
{
  "languageId": "uuid",
  "topicsCount": 5,
  "wordsCount": 150,
  "verbsCount": 20,
  "essaysCount": 3,
  "avgSuccessRate": 75.5,
  "mostDifficultWords": [
    {
      "id": "uuid",
      "term": "irregardless",
      "successRate": 20.0
    }
  ],
  "recentActivity": {
    "last7Days": {
      "attempts": 45,
      "correctCount": 32,
      "successRate": 71.1
    }
  }
}
```

### GET /stats/errors
Obtener estadísticas de errores
```json
Query params:
- languageId: string (optional)

Response 200:
{
  "totalErrors": 25,
  "byType": {
    "accent": 15,
    "grammar": 8,
    "spelling": 2
  },
  "mostCommonErrors": [
    {
      "original": "gusto",
      "corrected": "gustó",
      "occurrences": 5
    }
  ]
}
```

---

## Características de la API

### Validación estricta
Para el entrenamiento, la validación sigue estas reglas:
- Ignorar mayúsculas/minúsculas
- Ignorar espacios al inicio y al final
- Ignorar puntuación adicional (., !, ?, etc.)
- **Respetar acentos** (gusto ≠ gustó)
- **Respetar orden de letras** exacto

### Paginación
Todos los endpoints de listado soportan:
```
?limit=50&offset=0
```

### Filtrado y ordenamiento
Los listados de palabras soportan:
```
?sortBy=learning    # Por nivel de aprendizaje (menos aprendidas primero)
?sortBy=recent      # Por fecha de creación
?sortBy=alphabetical # Alfabéticamente
```

### Manejo de errores
```json
Error 400 (Bad Request):
{
  "error": "Validation error",
  "details": {
    "term": "Term is required"
  }
}

Error 404 (Not Found):
{
  "error": "Resource not found",
  "message": "Topic with id 'xyz' not found"
}

Error 500 (Internal Server Error):
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```
