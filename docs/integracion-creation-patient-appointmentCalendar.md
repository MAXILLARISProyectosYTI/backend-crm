> Copiado del vault Obsidian `maxillaris-memory/03-referencia/` el 2026-08-27 para que la nota viva en el repositorio.
> Los enlaces `[[nota]]` del vault se dejaron como texto. Índice de este repo: `docs/README.md`.

# Integración: creation_patient ↔ appointmentCalendar ↔ backends

> Documento maestro. **Consultar antes** de tocar flujos de agenda, iframe o oportunidades.

## Resumen en una frase

`creation_patient` es el **padre** (shell CRM). Embebe `appointmentCalendar` en un **iframe** y le pasa tokens/contexto por **postMessage**. El calendario llama a **3 backends** según la acción.

---

## Diagrama de arquitectura

```
creation_patient (React, /manager_leads/*)
    │
    ├── REST ──► backend-crm (VITE_CRM_API_BASE_URL)
    │              • login, oportunidades, KPI, comisiones, crm-controles
    │              • getTokenCrm: /auth/by-user/{user}
    │              • getToken SV: /opportunity/get-token-sv/{user}
    │
    └── iframe + postMessage ──► appointmentCalendar (/espo-sv)
                                    │
                                    ├── REST ──► sv-backend-main (VITE_API_URL_BACKEND)
                                    │              • pacientes, citas, facturas, OS
                                    │
                                    ├── WS ──────► wsk-schedule-backend (VITE_APP_API_URL_WS)
                                    │              • namespace RealTimeHubv2
                                    │
                                    └── REST ──► backend-crm (VITE_CRM_API_BASE_URL)
                                                   • updateOpportunity, check-document-crm
```

---

## 3 formas de abrir el calendario desde creation_patient

### 1. Flujo comercial — AppointmentRouter → IframeHandler

**Archivos:** `AppointmentRouter.tsx`, `IframeHandler.tsx`

1. Usuario en oportunidad: *"¿Ya es paciente?"*
2. **Sí** → `IframeHandler` con `shouldAutoOpenModal: true` (modal 5 pasos)
3. **No** → `ClientCreationForm` → luego agenda

### 2. Flujos OI / facturación / contrato — MainApp → IframeHandler

**Archivo:** `MainApp.tsx`

Estados que llevan a iframe:
- `currentComponent === 'iframe'`
- Tras `ContractManager` / factura → `auto_open_appointment_modal` en sessionStorage
- Flujos OI: `oiFlowSelector`, `generateOsOi`, `flowComplete`
- Puede enviar `reservationPlan`, reprogramación, `forceOiIframe`

### 3. CRM pestaña Agenda (solo lectura)

**Archivos:**
- `CRM/agenda/Agenda.tsx` — CRM ventas
- `CRMControles/pages/AgendaPage.tsx` — controles OFM

Mismo iframe `/espo-sv`, pero postMessage incluye:
```json
{ "is_crm_read_only": true, "tipo_agenda": 100 }
```

---

## URL del iframe

```
{VITE_IFRAME_APPOINTMENT}/espo-sv?sede={id}&uuid-opportunity={uuid}
```

**Ejemplo prod (env.example):** `https://agenda.maxillaris.pe/espo-sv`

**Query params comunes:**
| Param | Origen |
|-------|--------|
| `sede` | 1=Lima, 15/18=Arequipa |
| `uuid-opportunity` | Oportunidad CRM activa |
| `auto_open_modal` | Abrir modal al cargar |
| `quote_history` | Flujo cotización/historial |

---

## Flujo de autenticación (padre → iframe)

En `IframeHandler`, antes de `postMessage`:

1. `getToken(usuario)` → CRM `GET /opportunity/get-token-sv/{userId}` → **token SV**
2. `getTokenCrm(usuario)` → CRM `GET /auth/by-user/{userId}` → **token CRM**
3. Envía ambos al iframe en `init_data`

Ver contrato completo: postMessage-contrato

---

## Qué hace appointmentCalendar con cada token

| Token | sessionStorage | Usado para |
|-------|----------------|------------|
| `token` (SV) | `ACCESS_TOKEN` | axiosInstanceBackend → sv-backend-main |
| `token_crm` | `token_crm` | updateOpportunity, algunos checks CRM |

**WebSocket:** conexión independiente con fecha + tipoAgenda → wsk-schedule-backend.

---

## Modal 5 pasos (appointmentCalendar)

1. Selección doctor / tipo cita
2. Datos paciente (`step2-patient-info.tsx` — puede consultar CRM por DNI)
3. Orden de servicio
4. Resumen orden
5. Resumen cita / confirmación

Al finalizar (si `uuid_opportunity` presente y modo iframe):
- `updateOpportunity()` → `PUT /opportunity/update-opportunity-procces/{id}` en **backend-crm**
- postMessage al padre: `APPOINTMENT_COMPLETED`

---

## Mensajes iframe → padre (creation_patient escucha)

| type | action | Efecto en padre |
|------|--------|-----------------|
| `APPOINTMENT_COMPLETED` | `reload_full_page` | `window.location.reload()` |
| `APPOINTMENT_COMPLETED` | `close_modal_only` | cierra sin reload |
| `APNEA_COURTESY_REFERRAL_SAVED` | — | guarda referral en storage |
| `CLEAR_AUTO_OPEN_FLAG` | `remove_auto_open_from_url` | limpia URL |
| `OI_REQUEST_RELOAD` | — | recarga iframe |
| `reprogramming_success_reload` | — | recarga iframe |

**Archivo listener:** `IframeHandler.tsx` → `handleMessage`

---

## Post-facturación → abrir agenda automática

En `MainApp.tsx`:
- Flags: `sessionStorage` / `localStorage` → `auto_open_appointment_modal`
- Se consumen al leer y pasan a `IframeHandler` como `shouldAutoOpenModal`

---

## Endpoints CRM usados desde appointmentCalendar

| Endpoint | Método | Servicio |
|----------|--------|----------|
| `/opportunity/update-opportunity-procces/{id}` | PUT | updateOpportunityService.ts |
| `/opportunities/check-document-crm/{doc}` | GET | organicLeadService.ts |
| `/opportunities/check-phone-crm/{phone}` | GET | organicLeadService.ts |
| `/opportunities/create-organic-lead` | POST | organicLeadService.ts |

Base URL: `VITE_CRM_API_BASE_URL` (update) o `VITE_APP_API_URL` (organic leads)

---

## Endpoints CRM usados desde creation_patient (padre)

| Endpoint | Uso |
|----------|-----|
| `/auth/by-user/{userId}` | Token CRM para iframe |
| `/opportunity/get-token-sv/{userId}` | Token SV para iframe |
| `/crm-controles/pacientes` | Lista controles (cache CRM) |
| `/crm-controles/sync` | Forzar sync con SV |
| Oportunidades, KPI, comisiones | Módulos CRM/* |

---

## Sedes

| ID | Sede |
|----|------|
| 1 | Lima |
| 15, 18 | Arequipa |

Origen sede: URL `?sede=`, sessionStorage `id_sede`, o postMessage `sede`/`idSede`.

---

## Archivos clave (código)

### creation_patient
- `src/components/IframeHandler.tsx` — iframe + postMessage out/in
- `src/components/MainApp.tsx` — routing flujos
- `src/components/AppointmentRouter.tsx` — ¿ya es paciente?
- `src/services/tokenService.ts` — getToken, getTokenCrm
- `src/components/CRM/agenda/Agenda.tsx` — agenda read-only ventas
- `src/components/CRMControles/pages/AgendaPage.tsx` — agenda controles

### appointmentCalendar
- `src/main.tsx` — solo routing (39 líneas)
- `src/AppShell.tsx` — decide contexto: CRM (iframe) vs standalone (Redirect por rol)
- `src/iframe/useCrmIframeBootstrap.ts` + `iframe/handleInitDataMessage.ts` — listener init_data
- `src/iframe/EspoSVRoute.tsx` — lectura de query params
- `src/bootstrap/` — arranques: auth dev, canal WS, catálogo de estados
- `src/components/modal/multi-step-modal.tsx` — 5 pasos + updateOpportunity
- `src/services/updateOpportunityService.ts` — PUT oportunidad CRM
- `src/services/organicLeadService.ts` — checks CRM
- `src/services/websocketService.ts` — tiempo real
- `src/stores/userStorageService.ts` — tokens en sessionStorage

---

## Variables de entorno

Ver variables-entorno

---

## Relacionado

- creation_patient
- appointmentCalendar
- backend-crm
- sv-backend-main
- wsk-schedule-backend
- postMessage-contrato
- Cashback referidos — flujo completo

#integracion #iframe #crm #agenda
