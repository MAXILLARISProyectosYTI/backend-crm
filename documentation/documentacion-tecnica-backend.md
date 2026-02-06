# Documentación técnica – Equipos, sede–equipo y asignación de usuarios

Cada endpoint se describe con método, ruta, cuerpo de petición (cuando aplica), respuesta y ejemplos de uso (crear, actualizar, eliminar, listar).

Todas las rutas requieren cabecera: `Authorization: Bearer <access_token>`.

---

# 1. Equipos (`/team`)

## 1.1 Listar equipos

**GET** `/team`

No lleva cuerpo. Devuelve todos los equipos activos (no eliminados).

**Respuesta (200):** array de equipos.

```json
[
  {
    "id": "68a60f243afa8a87f",
    "name": "Ejecutivo Comercial",
    "deleted": false,
    "positionList": null,
    "createdAt": "2025-08-20 21:34:56",
    "modifiedAt": "2025-08-20 21:34:56",
    "layoutSetId": null,
    "workingTimeCalendarId": null
  },
  {
    "id": "68b75568eb21093ef",
    "name": "Team Leader Lima",
    "deleted": false,
    "positionList": null,
    "createdAt": "2026-02-04 10:00:00",
    "modifiedAt": "2026-02-04 10:00:00",
    "layoutSetId": null,
    "workingTimeCalendarId": null
  }
]
```

---

## 1.2 Obtener un equipo

**GET** `/team/:id`

- **Parámetro:** `id` (string, id del equipo).

**Respuesta (200):** un equipo.

```json
{
  "id": "68b75568eb21093ef",
  "name": "Team Leader Lima",
  "deleted": false,
  "positionList": null,
  "createdAt": "2026-02-04 10:00:00",
  "modifiedAt": "2026-02-04 10:00:00",
  "layoutSetId": null,
  "workingTimeCalendarId": null
}
```

**Respuesta (404):** `{ "statusCode": 404, "message": "Equipo con ID xxx no encontrado" }`

---

## 1.3 Crear equipo

**POST** `/team`  
**Content-Type:** `application/json`

**Cuerpo:**


| Campo        | Tipo   | Obligatorio | Descripción                              |
| ------------ | ------ | ----------- | ---------------------------------------- |
| name         | string | Sí          | Nombre del equipo (máx. 100 caracteres). |
| positionList | string | No          | Lista de posiciones (máx. 255).          |


**Ejemplo de petición:**

```json
{
  "name": "Team Leader Lima"
}
```

**Respuesta (201):** equipo creado (el `id` lo genera el backend).

```json
{
  "id": "68f1a2b3c4d5e6f7a",
  "name": "Team Leader Lima",
  "deleted": false,
  "positionList": null,
  "createdAt": "2026-02-04 10:00:00",
  "modifiedAt": "2026-02-04 10:00:00",
  "layoutSetId": null,
  "workingTimeCalendarId": null
}
```

---

## 1.4 Actualizar equipo

**PATCH** `/team/:id`  
**Content-Type:** `application/json`

- **Parámetro:** `id` (string, id del equipo).
- **Cuerpo:** solo los campos a cambiar (todos opcionales).


| Campo        | Tipo   | Descripción                  |
| ------------ | ------ | ---------------------------- |
| name         | string | Nombre (máx. 100).           |
| positionList | string | Lista posiciones (máx. 255). |


**Ejemplo de petición:**

```json
{
  "name": "Team Leader Lima - Sede Central"
}
```

**Respuesta (200):** equipo actualizado.

```json
{
  "id": "68f1a2b3c4d5e6f7a",
  "name": "Team Leader Lima - Sede Central",
  "deleted": false,
  "positionList": null,
  "createdAt": "2026-02-04 10:00:00",
  "modifiedAt": "2026-02-04 11:30:00",
  "layoutSetId": null,
  "workingTimeCalendarId": null
}
```

**Respuesta (404):** si el equipo no existe.

---

## 1.5 Eliminar equipo

**DELETE** `/team/:id`

- **Parámetro:** `id` (string, id del equipo).
- **Cuerpo:** ninguno.

**Respuesta (204):** sin contenido (soft delete correcto).

**Respuesta (404):** `{ "statusCode": 404, "message": "Equipo con ID xxx no encontrado" }`

---

## 1.6 Listar usuarios del equipo

**GET** `/team/:id/users`

- **Parámetro:** `id` (string, id del equipo).

**Respuesta (200):** array de ids de usuarios.

```json
["68aca6a8c35e7ddfc", "68a63f809cad3f474", "690d0437546cc1678"]
```

**Respuesta (404):** si el equipo no existe.

---

## 1.7 Asignar usuario al equipo

**POST** `/team/:id/users/:userId`

- **Parámetros:** `id` = id del equipo (destino), `userId` = id del usuario.
- **Cuerpo (opcional):** `application/json`

| Campo                  | Tipo    | Descripción                                                                 |
| ---------------------- | ------- | --------------------------------------------------------------------------- |
| confirm                | boolean | Si el usuario ya está en este equipo, enviar `true` para confirmar.         |
| confirmAsignacionDoble | boolean | Si está en otro equipo y se permite doble asignación, enviar `true`.         |
| confirmConsecuencias   | boolean | Confirmar que se entienden las consecuencias de asignar a dos equipos.      |
| mover                  | boolean | Si es `true`, se quita al usuario de todos los equipos actuales y se asigna solo a este (mover de un equipo a otro en una sola petición). |

- Si el usuario ya está en **este** equipo: enviar `confirm: true` para confirmar, o no hacer nada si solo se quiere dejar constancia.
- Si está en **otro(s) equipo(s)** y se quiere **mover** (dejar solo en este): enviar `mover: true`.
- Si está en otro(s) y se quiere **asignación doble**: enviar `confirmAsignacionDoble: true` y `confirmConsecuencias: true`.

**Ejemplo – mover de Team Leader a otro equipo:**

```json
POST /team/68b75568eb21093ef/users/68aca6a8c35e7ddfc
Content-Type: application/json

{ "mover": true }
```

**Respuesta (201):** registro creado o ya existente (team_user). El cuerpo puede incluir `teamUser` y `message`.

```json
{
  "teamUser": {
    "id": 12345,
    "teamId": "68f1a2b3c4d5e6f7a",
    "userId": "68aca6a8c35e7ddfc",
    "role": null,
    "deleted": false
  },
  "message": "Usuario movido al equipo \"Team Leader Lima\" (quitado de otros equipos)."
}
```

**Respuesta (409):** cuando se requiere confirmación y no se envió en el body. Ejemplo:  
`{ "statusCode": 409, "message": "El usuario ya está asignado al equipo \"...\". Para confirmar esta operación envíe confirm: true en el body." }`  
Si está en otro equipo:  
`{ "statusCode": 409, "message": "El usuario ya está asignado al equipo \"...\". Para moverlo a este equipo envíe mover: true en el body, o para asignación doble confirmAsignacionDoble: true y confirmConsecuencias: true." }`

**Respuesta (404):** si el equipo no existe.

---

## 1.8 Quitar usuario del equipo

**DELETE** `/team/:id/users/:userId`

- **Parámetros:** `id` = id del equipo, `userId` = id del usuario.
- **Cuerpo:** ninguno.

**Respuesta (204):** sin contenido (asignación desactivada con soft delete).

**Respuesta (404):** `{ "statusCode": 404, "message": "Asignación usuario-equipo no encontrada" }`

---

# 2. Sede ↔ Equipo (`/campus-team`)

## 2.1 Listar todas las asignaciones sede–equipo

**GET** `/campus-team`

No lleva cuerpo. Devuelve todas las asignaciones sede ↔ equipo con **nombre de la sede** y **nombre del equipo** (además de `campusId` y `teamId`). Los nombres de sede se obtienen desde SV; los de equipo desde la tabla `team`. Si no se puede resolver un nombre (ej. SV no disponible), el campo correspondiente viene en `null`.

**Respuesta (200):**

```json
[
  { "campusId": 1, "teamId": "68a9d71d1cfbeae93", "campusName": "Lima", "teamName": "Ejecutivo Comercial OI" },
  { "campusId": 1, "teamId": "68a9d710d5a90f5f4", "campusName": "Lima", "teamName": "Ejecutivo Comercial APNEA" },
  { "campusId": 1, "teamId": "68f1a2b3c4d5e6f7a", "campusName": "Lima", "teamName": "Team Leader Lima" }
]
```

---

## 2.2 Listar sedes con equipos configurados

**GET** `/campus-team/campuses`

No lleva cuerpo. Lista de `campusId` que tienen al menos un equipo asignado.

**Respuesta (200):**

```json
[1, 2]
```

Si no hay datos, el backend puede devolver `[1]` por defecto.

---

## 2.3 Listar equipos de una sede

**GET** `/campus-team/campus/:campusId`

- **Parámetro:** `campusId` (entero). Ej.: Lima = 1.

**Respuesta (200):** array de ids de equipos.

```json
["68a9d71d1cfbeae93", "68a9d710d5a90f5f4", "68a60f243afa8a87f", "68f1a2b3c4d5e6f7a"]
```

---

## 2.4 Asignar equipo a una sede

**POST** `/campus-team`  
**Content-Type:** `application/json`

**Cuerpo:**


| Campo    | Tipo   | Obligatorio | Descripción                         |
| -------- | ------ | ----------- | ----------------------------------- |
| campusId | number | Sí          | Id de la sede (ej. 1 = Lima).       |
| teamId   | string | Sí          | Id del equipo (máx. 17 caracteres). |


**Ejemplo de petición:**

```json
{
  "campusId": 1,
  "teamId": "68f1a2b3c4d5e6f7a"
}
```

**Respuesta (201):** asignación creada.

```json
{
  "campusId": 1,
  "teamId": "68f1a2b3c4d5e6f7a"
}
```

**Respuesta (409):** `{ "statusCode": 409, "message": "El equipo ya está asignado a esta sede" }`

---

## 2.5 Mover equipo de una sede a otra

**POST** `/campus-team/move`  
**Content-Type:** `application/json`

Quita el equipo de la sede de origen y lo asigna a la sede de destino en una sola petición.

**Cuerpo:**

| Campo         | Tipo   | Obligatorio | Descripción                                      |
| ------------- | ------ | ----------- | ------------------------------------------------ |
| fromCampusId  | number | Sí          | Id de la sede de origen (de la que se quita).    |
| toCampusId    | number | Sí          | Id de la sede de destino (a la que se asigna).   |
| teamId        | string | Sí          | Id del equipo (máx. 17 caracteres).             |

**Ejemplo de petición:**

```json
{
  "fromCampusId": 1,
  "toCampusId": 2,
  "teamId": "68f1a2b3c4d5e6f7a"
}
```

**Respuesta (201):** asignación en la sede de destino.

```json
{
  "campusId": 2,
  "teamId": "68f1a2b3c4d5e6f7a"
}
```

**Respuesta (409):** si sede origen y destino son iguales: `{ "statusCode": 409, "message": "La sede de origen y la de destino no pueden ser la misma" }`  
**Respuesta (404):** si no existe la asignación en la sede de origen: `{ "statusCode": 404, "message": "Asignación sede-equipo no encontrada" }`  
**Respuesta (409):** si el equipo ya está en la sede de destino: `{ "statusCode": 409, "message": "El equipo ya está asignado a esta sede" }`

---

## 2.6 Quitar equipo de una sede

**DELETE** `/campus-team/campus/:campusId/team/:teamId`

- **Parámetros:** `campusId` (entero), `teamId` (string).
- **Cuerpo:** ninguno.

**Respuesta (204):** sin contenido.

**Respuesta (404):** `{ "statusCode": 404, "message": "Asignación sede-equipo no encontrada" }`

---

# 3. Flujo resumido: Team Leader Lima

1. **Crear equipo:**
  `POST /team` → `{ "name": "Team Leader Lima" }`  
   Guardar el `id` de la respuesta.
2. **Asignar equipo a sede Lima:**
  `POST /campus-team` → `{ "campusId": 1, "teamId": "<id_del_paso_1>" }`
3. **Asignar usuarios:**
  Por cada usuario: `POST /team/<id_del_paso_1>/users/<userId>`.
4. **Consultar:**
  - Equipos de Lima: `GET /campus-team/campus/1`  
  - Usuarios del equipo: `GET /team/<id_del_paso_1>/users`
5. **Actualizar nombre del equipo:**
  `PATCH /team/<id>` → `{ "name": "Nuevo nombre" }`
6. **Quitar un usuario del equipo:**
  `DELETE /team/<id>/users/<userId>`
7. **Mover el equipo a otra sede:**
  `POST /campus-team/move` → `{ "fromCampusId": 1, "toCampusId": 2, "teamId": "<teamId>" }`
8. **Quitar el equipo de la sede:**
  `DELETE /campus-team/campus/1/team/<teamId>`

---

*Las fechas en las respuestas pueden venir formateadas por el interceptor del backend (ej. `yyyy-MM-dd HH:mm:ss`). Los códigos HTTP indicados son los que devuelve la API en cada caso.*