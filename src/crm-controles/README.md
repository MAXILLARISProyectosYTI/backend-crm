# Módulo CRM Controles (backend-crm)

## Flujo

1. **Cron** (`CrmControlesCronService`) llama periódicamente a `CrmControlesService.syncFromSv()`.
2. **SV**: `SvServices.getCrmControlesPatientsFromSv()` hace `GET` a SV usando token admin (`getTokenSvAdmin`).
3. El resultado se guarda en **memoria** y se expone por API REST bajo el prefijo `crm-controles`.

## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `URL_BACK_SV` | Base URL del backend SV (ya usada por el CRM) | — |
| `USERNAME_ADMIN` / `PASSWORD_ADMIN` | Login SV para token | — |
| `SV_CRM_CONTROLES_PATH` | Path del GET en SV (ej. `/crm-controles/ofm-patients`) | `/crm-controles/ofm-patients` |
| `SV_CRM_CONTROLES_TIMEOUT_MS` | Timeout de la petición a SV | `120000` |
| `CRM_CONTROLES_CRON` | Expresión cron (6 campos) | `0 */3 * * * *` (cada 3 min) |
| `CRM_CONTROLES_BOOT_SYNC_DELAY_MS` | Delay antes del primer sync al arrancar | `8000` |

## Endpoints (solo `user.type === 'admin'` en CRM + JWT)

- `GET /crm-controles/pacientes` — lista cacheada + `meta.lastSyncAt`, `meta.lastError`
- `GET /crm-controles/health` — `count` + `meta`
- `POST /crm-controles/sync` — fuerza sincronización con SV

## Contrato esperado desde SV

El GET en SV debe devolver:

- un **array** de objetos, o
- `{ data: [...] }`, o
- `{ items: [...] }`

Hasta definir el DTO final, cada ítem es un `Record<string, unknown>`.

## Frontend

Consumir desde `creation_patient`:

`src/components/CRMControles/services/crmControlesApi.ts`

Base URL: `VITE_CRM_API_BASE_URL` (misma que el resto del CRM).
