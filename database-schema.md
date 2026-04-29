# Modelo de Datos - Language Learning App

## Stack
- PostgreSQL
- Prisma ORM
- Node.js + Express + TypeScript

---

## Esquema de Tablas

### 1. Languages (Idiomas)
Tabla principal para los idiomas que el usuario está aprendiendo.

```prisma
model Language {
  id        String   @id @default(uuid())
  name      String   // ej: "Español", "English"
  code      String   @unique // ej: "es", "en"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relaciones
  topics    Topic[]
  verbs     Verb[]
  essays    Essay[]
}
```

---

### 2. Topics (Temarios/Carpetas)
Temarios que agrupan palabras por categorías.

```prisma
model Topic {
  id          String   @id @default(uuid())
  name        String   // ej: "Verbos irregulares", "Vocabulario médico"
  description String?
  languageId  String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relaciones
  language    Language @relation(fields: [languageId], references: [id], onDelete: Cascade)
  words       Word[]

  @@index([languageId])
}
```

---

### 3. Words (Palabras)
Palabras con término y definición, incluyendo estadísticas de aprendizaje.

```prisma
model Word {
  id         String   @id @default(uuid())
  term       String   // La palabra a aprender
  definition String   // La definición o traducción
  topicId    String

  // Estadísticas de aprendizaje
  attempts      Int      @default(0) // Número de intentos
  correctCount  Int      @default(0) // Número de aciertos
  successRate   Float    @default(0) // Porcentaje de acierto (calculado)

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  // Relaciones
  topic      Topic    @relation(fields: [topicId], references: [id], onDelete: Cascade)

  @@index([topicId])
  @@index([successRate]) // Para ordenar por nivel de aprendizaje
}
```

---

### 4. Verbs (Verbos)
Sistema de verbos con conjugaciones.

```prisma
model Verb {
  id         String   @id @default(uuid())
  infinitive String   // ej: "hablar", "comer", "vivir"
  languageId String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  // Relaciones
  language      Language         @relation(fields: [languageId], references: [id], onDelete: Cascade)
  conjugations  VerbConjugation[]

  @@index([languageId])
}

model VerbConjugation {
  id        String   @id @default(uuid())
  verbId    String
  tense     String   // ej: "presente", "pretérito", "futuro"
  person    String   // ej: "yo", "tú", "él/ella", "nosotros", "vosotros", "ellos/ellas"
  form      String   // ej: "hablo", "hablas", "habla"

  // Estadísticas de aprendizaje
  attempts      Int      @default(0)
  correctCount  Int      @default(0)
  successRate   Float    @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relaciones
  verb      Verb     @relation(fields: [verbId], references: [id], onDelete: Cascade)

  @@index([verbId])
  @@unique([verbId, tense, person]) // Una conjugación única por verbo, tiempo y persona
}
```

---

### 5. Essays (Redacciones)
Sistema de redacciones con corrección automática.

```prisma
model Essay {
  id           String   @id @default(uuid())
  title        String?  // Título opcional de la redacción
  originalText String   @db.Text // Texto original del usuario
  languageId   String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Relaciones
  language     Language        @relation(fields: [languageId], references: [id], onDelete: Cascade)
  corrections  EssayCorrection[]

  @@index([languageId])
}

model EssayCorrection {
  id               String   @id @default(uuid())
  essayId          String
  correctedText    String   @db.Text // Texto corregido

  // Feedback de la IA
  feedback         String?  @db.Text // Explicación general de la corrección

  createdAt        DateTime @default(now())

  // Relaciones
  essay            Essay    @relation(fields: [essayId], references: [id], onDelete: Cascade)
  errors           Error[]

  @@index([essayId])
}

model Error {
  id                String           @id @default(uuid())
  correctionId      String
  errorType         String           // "accent", "grammar", "spelling", "other"
  original          String           // Texto incorrecto
  corrected         String           // Texto corregido
  explanation       String?          // Explicación del error
  position          Int?             // Posición en el texto original

  // Estadísticas de aprendizaje (para convertir en palabras)
  attempts          Int              @default(0)
  correctCount      Int              @default(0)
  successRate       Float            @default(0)

  // Si el error se ha convertido en una palabra para practicar
  convertedToWord   Boolean          @default(false)
  wordId            String?          // Referencia a la palabra creada

  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  // Relaciones
  correction        EssayCorrection  @relation(fields: [correctionId], references: [id], onDelete: Cascade)

  @@index([correctionId])
  @@index([errorType])
}
```

---

## Características clave del modelo

### 1. Estadísticas de aprendizaje
Todas las entidades que se practican (words, verb_conjugations, errors) tienen:
- `attempts`: número de intentos
- `correctCount`: número de aciertos
- `successRate`: porcentaje de acierto (0-100)

### 2. Cascadas de eliminación
- Si se elimina un idioma, se eliminan todos sus temas, verbos y redacciones
- Si se elimina un tema, se eliminan todas sus palabras
- Si se elimina una redacción, se eliminan todas sus correcciones y errores

### 3. Índices para rendimiento
- Índices en claves foráneas para joins rápidos
- Índice en `successRate` para ordenar palabras por nivel de aprendizaje
- Índice en `errorType` para filtrar errores por tipo

### 4. Extensibilidad
El modelo está diseñado para:
- Soportar múltiples idiomas simultáneamente
- Permitir diferentes tipos de entrenamiento
- Convertir errores en palabras para práctica adicional
- Almacenar feedback detallado de la IA

---

## Queries principales

### Ordenar palabras por nivel de aprendizaje
```sql
SELECT * FROM words
WHERE topic_id = '...'
ORDER BY success_rate ASC, attempts ASC, created_at DESC;
```

### Obtener errores más frecuentes
```sql
SELECT error_type, COUNT(*) as count
FROM errors
WHERE converted_to_word = false
GROUP BY error_type
ORDER BY count DESC;
```

### Estadísticas de un idioma
```sql
SELECT
  l.name,
  COUNT(DISTINCT t.id) as topics_count,
  COUNT(DISTINCT w.id) as words_count,
  AVG(w.success_rate) as avg_success_rate
FROM languages l
LEFT JOIN topics t ON t.language_id = l.id
LEFT JOIN words w ON w.topic_id = t.id
WHERE l.id = '...'
GROUP BY l.id, l.name;
```
