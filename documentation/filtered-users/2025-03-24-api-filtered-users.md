# API `filtered-users`

**Fecha de documentación:** 24 de marzo de 2025  

Módulo NestJS (`FilteredUsersModule`) que expone listados de usuarios con reglas de negocio (equipos definidos en `FILTERED_USERS_TEAM_IDS`, exclusión de roles y tipos). Implementación: `src/filtered-users/`.

## Autenticación

Los endpoints de este controlador son **públicos**: **no** requieren cabecera `Authorization` ni token JWT.

---

## Base URL

Prefijo del controlador: **`/filtered-users`**.

Si la app corre en `http://localhost:8990` (o el `PORT` configurado), la base es:

`http://localhost:<PORT>/filtered-users`

---

## Endpoints

### 1. Listar usuarios filtrados

**`GET /filtered-users`**

Devuelve usuarios que cumplen **todas** estas condiciones:

| Criterio | Descripción |
|----------|-------------|
| Activo en CRM | `deleted = false` |
| Equipo | Pertenecen a al menos un equipo cuyo id está en **`FILTERED_USERS_TEAM_IDS`** (`src/globals/ids.ts`): todos los valores de **`TEAMS_IDS`** excepto **CERRADORAS** y **ASISTENTES_COMERCIALES** (vía `team_user`) |
| Tipo de usuario | `type` distinto de `admin` y `system` (comparación insensible a mayúsculas; `NULL` permitido) |
| Roles | **No** tienen asignación vigente (`role_user`) con rol **cerradora** ni **asistente comercial** (`ROLES_IDS` en `src/globals/ids.ts`) |

**Respuesta:** array de objetos usuario **sin** el campo `password` (tipo `UserPublic`), orden alfabético por `userName` (utilidad `orderListAlphabetic`).

**Ejemplo:**

```http
GET /filtered-users
```

---

### 2. Coincidencia de usuario SV (`c_usersv`)

**`GET /filtered-users/match-sv-username`**

Indica si **algún** usuario del **mismo conjunto filtrado** que el listado anterior tiene el campo CRM **`c_usersv`** igual al valor indicado **y** tiene al menos uno de los roles permitidos (`MATCH_SV_USERNAME_ALLOWED_ROLE_IDS` en `src/globals/ids.ts`).

| Parámetro (query) | Obligatorio | Descripción |
|--------------------|-------------|-------------|
| `svUserName`       | Sí | Nombre de usuario en SV a comparar |

- Si `svUserName` falta, está vacío o solo espacios → **`400 Bad Request`** (`svUserName es obligatorio y no puede estar vacío`).
- La comparación usa **trim** y **no distingue mayúsculas/minúsculas**.
- Solo considera filas con `c_usersv` no nulo y no vacío.

**Respuesta:** literal JSON booleano: `true` o `false`.

**Ejemplo:**

```http
GET /filtered-users/match-sv-username?svUserName=jose.jara
```

**Respuesta posible:**

```json
true
```

---

## Notas

- El puerto por defecto en `main.ts` es **8990** si no se define `PORT` en el entorno.
- Para ampliar criterios (otras líneas, otros roles) hay que ajustar `src/filtered-users/filtered-users.service.ts` y actualizar este documento.
