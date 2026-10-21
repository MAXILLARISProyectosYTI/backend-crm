# Levantar el backend del CRM (backend-crm)

Back del **CRM** (NestJS + PostgreSQL + Socket.IO). En producción es `support.maxillaris.pe/api-crm-lima`.

Node **20** (el `Dockerfile` usa `node:20-alpine`).

```bash
cp .env.example .env
npm install
npm run start:dev
```

Queda en `http://localhost:5432` (`PORT=5432`; sin esa variable usa el 8990). Ojo: es el mismo número que el puerto por defecto de PostgreSQL, pero aquí es el CRM.

## Depende de (levantar antes)
| Proyecto | Para qué | Puerto |
|---|---|---|
| PostgreSQL (base `crm`) | base de datos (obligatorio) | 5432 |
| `sv-backend-main` (Node 18, necesita Redis) | `URL_BACK_SV`, `URL_INVOICE_MIFACT_V3`, `URL_DOWNLOAD_FILES` | 5533 |
| `wsk-schedule-backend` (Node 24) | `URL_SCHEDULE_BACKEND` (agenda) | 3606 |

Opcional: `SV_DB_*` para leer directo la base de SV.

## Quién lo usa
- `frontend-crm` (creation_patient): API y WebSocket de oportunidades.
- `mf-appointment-calendar`: `VITE_CRM_API_BASE_URL` (`http://localhost:5432`).
- `sv-backend-main`: `BACKEND_CRM_URL` (opcional).

## Notas
- `URL_FILES` no tiene versión local (en producción es un servidor de archivos aparte): las funciones de archivos no van a funcionar en local.
- No pongas en el `.env` local URLs de `161.132.199.230` ni `api6`/`api7`: son producción.
