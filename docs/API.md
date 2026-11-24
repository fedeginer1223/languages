# API externa

## Qué es y cómo se protege

La API externa (`/api/v1/ext/*`) permite añadir vocabulario y estructuras desde fuera de la app, por ejemplo desde un asistente (ChatGPT, Claude) o un script. No usa la sesión del navegador: se protege con una clave compartida.

- Define la variable de entorno `EXTERNAL_API_KEY` en `backend/.env` (local) o en las variables de Railway (producción). Usa una cadena larga y aleatoria, por ejemplo `openssl rand -hex 32`.
- Envía la clave en cada petición con la cabecera `X-API-Key: <clave>` (también vale `Authorization: Bearer <clave>`).
- Si `EXTERNAL_API_KEY` no está definida o está vacía, la API responde `503 {"error":"external_api_disabled"}`. Con una clave incorrecta responde `401`. Límite: 60 peticiones por minuto por clave (`429` si se supera).
- Los datos que expone pertenecen a un único usuario: el de `EXTERNAL_API_USER_EMAIL` (opcional) o, si falta, el usuario más antiguo.
- Cada petición deja una línea de log: `[ext] <método> <ruta> key=abcd… ip=… created=…` (solo los 4 primeros caracteres de la clave).

URL base:

- Local: `http://localhost:3002/api/v1/ext`
- Producción: `https://<tu-app>.up.railway.app/api/v1/ext`

En los ejemplos: `BASE=http://localhost:3002/api/v1/ext` y `KEY=<tu clave>`.

## Convenciones

- Los sustantivos llevan el artículo indefinido en `term`: `une tartiflette`, `un couteau` (no `tartiflette` ni `couteau`).
- La `definition` va en español, breve; si ayuda, con una aclaración entre paréntesis.
- Si no se indica `topic`, las palabras van a «Vocabulario General» (se crea si no existe).
- El idioma se indica con su código (`fr`, `en`, …), sin distinguir mayúsculas. `GET /languages` lista los disponibles.
- Los duplicados se detectan por `term` en todo el idioma (no solo en el topic), sin distinguir mayúsculas ni acentos.

## Endpoints

### GET /languages

```bash
curl -H "X-API-Key: $KEY" $BASE/languages
```

```json
[
  { "id": "b43cf291-…", "code": "en", "name": "English" },
  { "id": "ca657ba1-…", "code": "fr", "name": "Français" }
]
```

### GET /topics?language=fr

Devuelve 404 si el idioma no existe.

```bash
curl -H "X-API-Key: $KEY" "$BASE/topics?language=fr"
```

```json
[
  { "id": "b5e4fc5b-…", "name": "Hoteles", "wordCount": 67 },
  { "id": "9a1c0e2d-…", "name": "Vocabulario General", "wordCount": 12 }
]
```

### POST /words

Añade de 1 a 200 palabras (`term` y `definition` no vacíos, máx. 200 caracteres). `topic` es opcional.

```bash
curl -X POST $BASE/words \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "language": "fr",
    "topic": "Vocabulario General",
    "words": [
      { "term": "une tartiflette", "definition": "la tartiflette (gratinado de patatas)" },
      { "term": "un couteau", "definition": "el cuchillo" }
    ]
  }'
```

```json
{
  "created": 1,
  "duplicates": [{ "term": "un couteau", "existingTopic": "Cocina" }],
  "topic": { "id": "9a1c0e2d-…", "name": "Vocabulario General" }
}
```

### GET /words/search?language=fr&q=tartiflette

Hasta 20 coincidencias en `term` o `definition` (sin distinguir mayúsculas ni acentos), las más exactas primero. Sirve para comprobar antes de añadir.

```bash
curl -H "X-API-Key: $KEY" "$BASE/words/search?language=fr&q=tartiflette"
```

```json
[
  { "term": "une tartiflette", "definition": "la tartiflette (gratinado de patatas)", "topic": "Vocabulario General", "srsLevel": 0 }
]
```

### POST /structures

Añade estructuras (frases modelo). `category` es opcional (por defecto `general`); `examples` también (`text` en el idioma de estudio, `spanish` es la frase en español a traducir). Duplicados: por `pattern` exacto.

```bash
curl -X POST $BASE/structures \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "language": "fr",
    "structures": [
      { "pattern": "Il se peut que ___", "category": "uncertainty",
        "examples": [{ "text": "Il se peut que je sois en retard.", "spanish": "Puede que llegue tarde." }] }
    ]
  }'
```

```json
{ "created": 1, "duplicates": [] }
```

### Errores

| Código | Significado |
|---|---|
| 400 | Cuerpo inválido (`{"error":"Validation error","details":{…}}`) |
| 401 | Clave ausente o incorrecta |
| 404 | Idioma desconocido (`language_not_found`) |
| 429 | Más de 60 peticiones por minuto |
| 503 | `EXTERNAL_API_KEY` no configurada |

## Instrucciones para un asistente (ChatGPT / Claude)

Pega este bloque en las instrucciones personalizadas, o en la descripción de una Action/herramienta, sustituyendo la URL y la clave.

```text
Tengo una app para aprender idiomas con una API. Base: https://<tu-app>.up.railway.app/api/v1/ext
Autenticación: cabecera X-API-Key con mi clave (<tu clave>).

Cuando te diga «apunta estas palabras» (o algo parecido: «guarda», «añade a mi vocabulario»):
1. Detecta el idioma de las palabras y usa su código en minúsculas: fr (francés), en (inglés)…
   Si dudas, llama antes a GET /languages para ver los códigos disponibles.
2. Para cada palabra crea { "term", "definition" }:
   - term en el idioma de estudio. Si es un sustantivo, incluye el artículo indefinido
     («une tartiflette», «un couteau»). Verbos en infinitivo.
   - definition en español, breve (puedes añadir una aclaración entre paréntesis).
3. Llama a POST /words con { "language": "<código>", "topic": "<tema si lo indiqué>", "words": [...] }.
   Si no indico tema, omite "topic" (se usará «Vocabulario General»). Máximo 200 palabras por llamada.
4. Si quiero saber si ya tengo una palabra, usa GET /words/search?language=<código>&q=<palabra>.
5. Responde con un resumen corto: cuántas se crearon y el topic. Si la respuesta trae "duplicates",
   NO las vuelvas a enviar ni las dupliques: dime cuáles ya existían y en qué topic
   ("existingTopic"). Solo si te lo pido, actualiza la definición o cámbialas de topic (eso no lo
   hace la API: dímelo y lo hago yo en la app).
6. Si la API responde 401/503, dime que revise la clave; no lo reintentes en bucle.
```

## Futuro: servidor MCP

Más adelante se podría exponer esta misma API como servidor MCP para usarla como herramienta nativa en Claude (no implementado).
