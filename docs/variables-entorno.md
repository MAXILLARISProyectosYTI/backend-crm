> Copiado del vault Obsidian `maxillaris-memory/03-referencia/` el 2026-08-27 para que la nota viva en el repositorio.
> Los enlaces `[[nota]]` del vault se dejaron como texto. Índice de este repo: `docs/README.md`.

# Variables de entorno — Maxillaris

> Nombres de variables solamente. **Valores reales en `.env` local — no commitear.**

---

## creation_patient (`env.example`)

| Variable | Apunta a | Uso |
|----------|----------|-----|
| `VITE_CRM_API_BASE_URL` | backend-crm | API CRM principal (login, oportunidades, tokens) |
| `VITE_API_BASE_URL` | sv-backend / proxy | API SV legacy |
| `VITE_IFRAME_APPOINTMENT` | appointmentCalendar host | URL base iframe agenda |
| `VITE_IFRAME_NEW_CLINIC_HISTORY` | new-clinic-history host | iframe HC |
| `VITE_IFRAME_CERRADORAS` | cerradoras CRM | iframe cerradoras |
| `VITE_APP_API_URL_WS` | wsk-schedule-backend | WebSocket agenda |
| `VITE_WEBSOCKET_URL` | backend-crm | Socket oportunidades |
| `VITE_WEBSOCKET_ENGINE_PATH` | — | `/api-crm-lima/socket.io` |
| `VITE_WEBSOCKET_NAMESPACE` | — | `/opportunity` |
| `VITE_API_BASE_URL_PDF` | — | PDFs |
| `VITE_TICKET_URL` | tickets API | Mesa ayuda embebida |
| `VITE_TICKET_API_KEY` | — | Auth tickets (**secreto**) |

---

## appointmentCalendar (`enviroments.ts`)

| Variable | Map en código | Backend |
|----------|---------------|---------|
| `VITE_API_URL_BACKEND` | `apiUrlBase` | **sv-backend-main** |
| `VITE_APP_API_URL_WS` | `apiWs` | **wsk-schedule-backend** |
| `VITE_CRM_API_BASE_URL` | `apiUrlBaseCrm` | **backend-crm** (updateOpportunity) |
| `VITE_APP_API_URL` | `apiAppApiUrl` | API app (organic leads → CRM) |
| `VITE_API_URL` | `apiUrl` | API auxiliar |
| `VITE_API_URL_ALEXIS` | `apiUrlAlexis` | API Alexis |
| `VITE_APP_API_URL_APIPHP` | `apiPhp` | PHP legacy |

---

## new-clinic-history (`.env.local`)

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_API_BASE_URL` | sv-backend-main |
| `NEXT_PUBLIC_API_BASE_URL_FILE` | Archivos |
| `NEXT_PUBLIC_API_BASE_URL_LABO` | Laboratorio |
| `NEXT_PUBLIC_API_BASE_URL_PHP` | PHP legacy |

**Puerto dev:** 7773  
**basePath:** `/new_cinic_history_lima`

---

## sv-backend-main

| Variable típica | Uso |
|---------------|-----|
| `DB_*` | PostgreSQL |
| JWT / mail / MiFact | Ver `.env` local |
| `KAFKA_BROKERS` | Broker Kafka — **casos clínicos IA** (ver nota dedicada) |
| `SCHEMA_REGISTRY_URL` | Schema Registry Confluent — validación eventos `clinical-case` |
| `CLINICAL_CASE_LLM` | `stub` \| `openai` — motor IA (requiere `openai/audit_apikey` en BD) |
| `CLINICAL_CASE_STT` | `stub` \| `openai` — transcripción voz; **stub no transcribe** (guarda `[STUB]`) |
| `CLINICAL_CASE_WHISPER_MODEL` | Modelo Whisper (default `whisper-1`) |
| `CLINICAL_CASE_OPENAI_MODEL` | Modelo texto (default `gpt-4o-mini`) |
| `CLINICAL_CASE_OPENAI_VISION_MODEL` | Modelo multimodal RX |
| `CLINICAL_CASE_WS_REQUIRE_AUTH` | JWT en WS `/clinical-case` (`true`/`false`; default `true` si `NODE_ENV=production`) |
| `CLINICAL_CASE_DLQ_MONITOR_ENABLED` | Cron alertas DLQ (`true`/`false`; default `true` en prod) |
| `CLINICAL_CASE_DLQ_MONITOR_CRON` | Expresión cron monitor DLQ (default `*/15 * * * *`) |
| `CLINICAL_CASE_RX_WATCHER_ENABLED` | Cron RX tardías (default `true`) |
| `CLINICAL_CASE_RX_WATCHER_CRON` | Expresión cron RX (default `0 * * * *`) |

**Kafka (detalle):** Kafka — entornos y variables

**Caso clínico IA (dev local):** `KAFKA_BROKERS=127.0.0.1:9092`, `SCHEMA_REGISTRY_URL=http://127.0.0.1:8081`, `CLINICAL_CASE_LLM=openai`, `CLINICAL_CASE_STT=openai`. Reiniciar backend tras cambios.

**Docs:** pipeline · auditoría · sesión 17/07

---

## backend-crm

| Variable | Uso |
|----------|-----|
| `URL_BACK_SV` | Base URL sv-backend para sync |
| `USERNAME_ADMIN` / `PASSWORD_ADMIN` | Token admin SV |
| `SV_CRM_CONTROLES_PATH` | `/crm-controles/ofm-patients` |
| `CRM_CONTROLES_CRON` | Cron sync controles |

---

## wsk-schedule-backend

Puerto típico dev: **3606** (según appointmentCalendar `.env`)  
Namespace: **RealTimeHubv2**

---

## Mapeo producción (referencia env.example)

```
agenda.maxillaris.pe          → appointmentCalendar (iframe)
support.maxillaris.pe/api-crm-lima → backend-crm
support.maxillaris.pe/api7    → sv-backend (proxy)
support.maxillaris.pe/api6    → wsk-schedule (WS)
```

#env #config
