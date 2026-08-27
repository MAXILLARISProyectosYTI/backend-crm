> Copiado del vault Obsidian `maxillaris-memory/03-referencia/` el 2026-08-27 para que la nota viva en el repositorio.
> Los enlaces `[[nota]]` del vault se dejaron como texto. Índice de este repo: `docs/README.md`.

# Cerradoras — choque de `cotizacion_id` en CRM

> Consultar cuando un paciente no aparece en cerradoras, o cuando el mismo `cotizacion_id` parece “pertenecer” a dos pacientes distintos.

Relacionado: cashback-referidos-flujo-completo, 2026-07-08-cashback-merges-ui-informe.

---

## Resumen

| Capa | Regla |
|------|--------|
| **SV** (`quotation`) | Cada `id` es único global; ligado a **un** `idclinichistory`. No se reutiliza entre pacientes. |
| **CRM** (`c_oportunidad_cerradora`) | Tras fix jul-2026: unicidad activa por **`(cotizacion_id, h_c_patient)`** + validación SV al crear. |

El choque original era un problema de **CRM** (reutilizar ID entre pacientes + dedupe global en listado). **Fix en código:** commit `f989c75` (`backend-crm`, 2026-07-08).

---

## Síntoma típico

```sql
SELECT id, name, h_c_patient, cotizacion_id, deleted, status, opportunity_id
FROM c_oportunidad_cerradora
WHERE cotizacion_id = '46728';
```

Resultado observado (ej. jul 2026):

| Filas | Paciente | HC | deleted |
|-------|----------|-----|---------|
| 7 | MOLERO GABRIELA | LMX126-008565 | true |
| 1 activa | Otro paciente (ej. prueba cashback) | LMX126-008596 | false |

Workaround manual:

```sql
UPDATE c_oportunidad_cerradora
SET deleted = true, modified_at = NOW()
WHERE cotizacion_id = '46728' AND deleted = false;
```

Eso “libera” la cola en CRM pero **no** cambia que en SV la cotización 46728 sigue siendo de Gabriela.

---

## Causas en código (antes del fix)

### 1. Unicidad solo por `cotizacion_id` (sin paciente)

Commit previo `41d5b0b` (jun-2026, Bryan): `findOpportunityCloserByQuotationId` → `where: { cotizacionId, deleted: false }` sin `h_c_patient`. Si paciente A tenía fila activa con ID X, paciente B no podía entrar aunque en SV su cotización fuera distinta.

### 2. Sin validación cotización ↔ historia clínica

`registrarPaciente` → `createOpportunityCloser` con `cotizacionId` + `hCPatient` del formulario. **Antes** no consultaba SV.

Modal front: `creation_patient/.../AgregarPacienteModal.tsx` — ID cotización sigue siendo **campo libre opcional** (pendiente mejorar UX).

### 3. Dedupe en listado solo por `cotizacion_id`

`appendCanonicalQuotationDedupe` en `findAll` hacía `PARTITION BY cotizacion_id` → en UI solo se veía **una** fila por ID aunque hubiera dos pacientes distintos (ej. 46728 de Gabriela y 46728 de otro HC).

### 4. Búsqueda SV + auto-insert

Si en cerradoras se busca por nombre y CRM no tiene resultados:

1. `getQuotationSearch` en SV (fuzzy por nombre/HC/id)
2. `existsOpportunityCloserByQuotationId` — **antes** solo por ID; **ahora** por `(id, history)`

Archivo SV búsqueda: `sv-backend-main/.../quotation.service.ts` → `getQuotationSearch`

---

## Flujos que crean cerradoras (correctos)

| Origen | Cómo | `cotizacion_id` |
|--------|------|-----------------|
| Cron CRM | `loopAddQuotationQueue` cada hora 9–21 | ID de SV + `history` del paciente dueño |
| Búsqueda tabla cerradoras | `findAll` + SV search si 0 resultados | Mismo criterio |
| Manual API | `POST /opportunities-closers/add-from-sv` | Body: `quotationId`, `name`, `history` |
| Panel pacientes | `POST /crm-cerradoras/pacientes` (`registrarPaciente`) | **Riesgo** si el usuario pone ID incorrecto |
| Bootstrap CRM | Sync `crm_cerradora_solicitudes` sin match en cerradora | `quotation_id` de solicitud |

---

## Secuencia que provoca el bug (operativa)

1. Paciente A tiene cerradora con `cotizacion_id = 46728` (correcto en SV).
2. Paciente B necesita aparecer en cerradoras; su cotización nueva en HC tiene otro ID (ej. 47150).
3. Usuario no ve a B → borra filas de A con SQL o muchos `deleted = true`.
4. Registra B con `cotizacion_id = 46728` (ID copiado, URL vieja, o confusión).
5. CRM muestra B; cerradoras/manager_leads carga **datos de A en SV**.

Las 7 filas `deleted` del mismo paciente suelen ser **reintentos** (crear → conflicto → borrar → volver a crear).

---

## Qué hacer bien (sin SQL manual)

### Verificar dueño en SV

```sql
SELECT q.id, ch.history, ch.name, ch."lastNameFather"
FROM quotation q
JOIN clinic_history ch ON ch.id = q.idclinichistory
WHERE q.id = <COTIZACION_ID>;
```

### Agregar paciente con su cotización real

- Crear cotización en HC para el paciente → anotar el **nuevo** `quotation.id`.
- Forzar cola sin esperar cron:

```http
POST /opportunities-closers/add-from-sv
{
  "quotationId": <id_sv>,
  "name": "<nombre completo>",
  "history": "LMX126-00XXXX"
}
```

Requiere oportunidad CRM con esa HC (`findOrSyncGestiónOpportunityByHc`).

### No reutilizar IDs

Aunque en CRM estén `deleted = true`, **no** reasignar un `cotizacion_id` a otro paciente.

---

## Fix implementado (2026-07-08, commit `f989c75`)

Repo: `backend-crm`. Autor: jherry.

### 1. Validación SV en `createOpportunityCloser`

Archivo: `src/opportunities-closers/opportunities-closers.service.ts`

Flujo cuando hay `cotizacionId`:

1. `getQuotationById(cotizacionNum, tokenSv)` → `GET {SV}/quotation/id/{id}` con Bearer.
2. Si el ID no existe en SV → `BadRequestException`.
3. `resolveClinicHistoryIdFromPayload` resuelve el `clinic_history.id` esperado desde `hCPatient` (código HC o numérico) u `opportunityId`.
4. Si `svQuotation.clinicHistoryId !== expectedClinicHistoryId` → `ConflictException` (409): *"La cotización X pertenece a otro paciente en SV"*.
5. Duplicado solo si ya existe fila activa para el **mismo par** `(cotizacionId, hCPatient)` → devuelve la existente (no error).

`registrarPaciente` (`crm-cerradoras.service.ts`) llama a `createOpportunityCloser` → **hereda** esta validación.

### 2. Unicidad por paciente: `findOpportunityCloserByQuotationAndPatient`

Nuevo método: `where: { cotizacionId, hCPatient, deleted: false }`.

`existsOpportunityCloserByQuotationId(quotationId, hCPatient?)` delega aquí. Sin `hCPatient` hace fallback al lookup global por ID (compatibilidad).

Usado en:

| Archivo | Uso |
|---------|-----|
| `opportunities-closers.service.ts` | `createOpportunityCloser`, `findAll` (auto-insert desde SV) |
| `opportunity-closers-crons.service.ts` | `loopAddQuotationQueue` — no reinserta si ya existe para ese `(id, history)` |
| `opportunities-closers.controller.ts` | `POST add-from-sv` — conflicto por paciente |

### 3. Índice único parcial en Postgres

Migración: `migraciones/1749550000000-UniqueCerradoraQuotationByPatient.ts`

```sql
CREATE UNIQUE INDEX uniq_c_oportunidad_cerradora_cot_hist
ON c_oportunidad_cerradora (cotizacion_id, h_c_patient)
WHERE deleted = false
  AND cotizacion_id IS NOT NULL AND TRIM(cotizacion_id) <> ''
  AND h_c_patient IS NOT NULL AND TRIM(h_c_patient) <> '';
```

Reemplaza índice anterior `uniq_c_oportunidad_cerradora_cotizacion_id` (solo por `cotizacion_id`).

### 4. Dedupe en listado por `(cotizacion_id, h_c_patient)`

`appendCanonicalQuotationDedupe`: `PARTITION BY cotizacion_id, h_c_patient` (antes solo `cotizacion_id`).

Efecto: dos pacientes con el mismo `cotizacion_id` contaminado **ambos** pueden aparecer en la tabla (ej. LMX126-008596 con 46728 y 46729).

### 5. Cliente SV: `getQuotationById`

Archivo: `src/sv-services/sv.services.ts`

Nuevo método; devuelve `{ id, clinicHistoryId }` desde `quotation.clinicHistory.id`.

---

## Pendiente (no en código)

1. **Front `AgregarPacienteModal`:** buscar cotización por HC en SV en lugar de ID manual libre.
2. **Deploy:** aplicar migración + reiniciar `backend-crm` en el entorno donde se use cerradoras.
3. **Datos contaminados:** filas históricas con ID ajeno siguen en BD (`deleted=true`); el fix **previene** nuevos casos y **no borra** automáticamente filas de otros pacientes.

---

## Archivos clave

| Repo | Archivo |
|------|---------|
| backend-crm | `opportunities-closers/opportunities-closers.service.ts` — `createOpportunityCloser`, `findAll`, dedupe |
| backend-crm | `opportunities-closers/opportunity-closers-crons.service.ts` — cron cola |
| backend-crm | `crm-cerradoras/crm-cerradoras.service.ts` — `registrarPaciente` |
| backend-crm | `opportunities-closers/opportunities-closers.entity.ts` — tabla `c_oportunidad_cerradora` |
| backend-crm | `migraciones/1749550000000-UniqueCerradoraQuotationByPatient.ts` — índice `(cotizacion_id, h_c_patient)` |
| backend-crm | `sv-services/sv.services.ts` — `getQuotationById` |
| sv-backend-main | `quotation/quotation.service.ts` — `getQuotationSearch` |
| creation_patient | `CRMCerradoras/components/AgregarPacienteModal.tsx` — **pendiente** UX cotización |

#cerradoras #cotizacion #crm #sv #c_oportunidad_cerradora
