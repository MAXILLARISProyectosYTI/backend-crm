# Actualización de oportunidad con facturas y órdenes de servicio (O.S)

Documentación del flujo de actualización de oportunidad que soporta **factura directa** (URLs de comprobantes) y **órdenes de servicio (O.S)** con consulta metódica del estado de facturación.

Todas las rutas requieren cabecera: `Authorization: Bearer <access_token>`.

---

## 1. Endpoint principal

### PUT `/opportunity/update-opportunity-procces/:id`

Actualiza la oportunidad con datos del proceso (cliente, paciente, cita, facturas y/o órdenes de servicio). Según el cuerpo, puede:

- Actualizar solo datos principales (paciente/cliente).
- Actualizar solo datos de cita y crear una reunión (meeting).
- Combinar datos principales + cita.
- Cerrar como **Cierre ganado** con **factura directa** (URLs de comprobantes) o con **O.S** (se consulta el estado de facturación hasta que esté facturada).
- Actualizar clinicHistoryCrm en SV (reserva, paciente, pago) cuando aplica.

**Parámetros de ruta**

| Parámetro | Tipo   | Descripción                |
| --------- | ------ | -------------------------- |
| id        | string | ID de la oportunidad (CRM) |

**Cuerpo (Content-Type: application/json)**

Interfaz `UpdateOpportunityProcces`. Todos los campos son opcionales; el backend detecta el “caso” según los campos enviados.

---

## 2. Campos del cuerpo (UpdateOpportunityProcces)

### 2.1 Datos cliente / paciente (main)

| Campo                     | Tipo   | Descripción                          |
| ------------------------- | ------ | ------------------------------------ |
| cLastNameFather           | string | Apellido paterno del cliente        |
| cLastNameMother           | string | Apellido materno del cliente        |
| cCustomerDocumentType      | string | Tipo de documento del cliente (ej. DNI) |
| cCustomerDocument         | string | Número de documento del cliente      |
| cPatientsname              | string | Nombre completo del paciente         |
| cPatientsPaternalLastName  | string | Apellido paterno del paciente        |
| cPatientsMaternalLastName  | string | Apellido materno del paciente       |
| cPatientDocument          | string | Número de documento del paciente    |
| cPatientDocumentType      | string | Tipo de documento del paciente     |
| cClinicHistory            | string | Código de historia clínica (requerido para Cierre ganado cuando hay factura u O.S) |

### 2.2 Facturas (cierre con factura directa)

| Campo     | Tipo   | Descripción |
| --------- | ------ | ----------- |
| cFacturas | object | URLs públicas desde las que el backend descarga los PDF. Al menos una no nula para activar descarga y cierre. |
| cFacturas.comprobante_soles   | string \| null | URL del comprobante en soles  |
| cFacturas.comprobante_dolares | string \| null | URL del comprobante en dólares |

Si se envían URLs y hay `cClinicHistory`, la oportunidad pasa a **Cierre ganado** con sub-estado **factura_directa**, se descargan los archivos y se marca `isPresaved = false`.

### 2.3 Órdenes de servicio (O.S) – cierre con O.S

| Campo                    | Tipo    | Descripción |
| ------------------------ | ------- | ----------- |
| cOrdenesServicio         | number[]| IDs de órdenes de servicio (sistema externo invoice-mifact-v3). Cierre ganado puede ser con una factura o con una O.S. |
| cOrdenesServicioMetadata | object  | Opcional. Metadata por O.S: `{ [serviceOrderId]: { descripcion?, numero_os?, ... } }` |

Si se envían O.S y hay `cClinicHistory`, la oportunidad pasa a **Cierre ganado** con sub-estado **orden_servicio_pendiente_factura**. El backend consulta metódicamente el estado de facturación (en cada llamada a este endpoint y cada 5 minutos por cron). Cuando alguna O.S esté facturada, se descargan las URLs, se marca `isPresaved = false` y el sub-estado pasa a **factura_directa**.

### 2.4 Datos de la cita

| Campo             | Tipo   | Descripción |
| ----------------- | ------ | ----------- |
| cAppointment      | string | Rango de horario (ej. `"15:30 - 16:00"`) |
| cDateReservation  | string | Fecha de reserva (ej. `"2026-03-02"`)   |
| cDoctor           | string | Nombre del doctor                        |
| cEnvironment      | string | Ambiente / consultorio                   |
| cSpecialty        | string | Especialidad                             |
| cTariff           | string | Tarifa                                   |
| reservationId     | number | **Requerido** cuando se envían datos de cita. ID de la reserva en SV. |

Si hay datos de cita (solo cita o main + cita), se crea una reunión (meeting) y se registra en el historial de acciones.

---

## 3. Detección de caso y payload

El backend clasifica el request en:

| Caso                    | Condición                                      | Acción |
| ------------------------ | ---------------------------------------------- | ------ |
| Solo cita                | Campos de cita presentes, sin datos main       | Actualiza solo campos de cita; requiere `reservationId`. |
| Solo datos principales   | Campos main presentes, sin datos de cita       | Actualiza solo campos main. |
| Datos principales + cita | Main y cita presentes                          | Actualiza ambos; requiere `reservationId`. |
| Otro                     | Ninguno de los anteriores                      | Actualiza con el cuerpo tal cual. |

Los “campos main” son: `cLastNameFather`, `cCustomerDocumentType`, `cCustomerDocument`, `cPatientsname`, `cPatientsPaternalLastName`, `cPatientsMaternalLastName`, `cPatientDocument`, `cPatientDocumentType`, `cClinicHistory`.  
Los “campos de cita” son: `cAppointment`, `cDoctor`, `cEnvironment`, `cSpecialty`, `cTariff`, `cDateReservation`.

---

## 4. Sub-estado de facturación (c_facturacion_sub_estado)

Cuando la oportunidad está en etapa **Cierre ganado**, el campo `cFacturacionSubEstado` indica:

| Valor                              | Significado |
| ---------------------------------- | ----------- |
| `factura_directa`                  | Se cerró con factura (URLs enviadas por el front o obtenidas de una O.S ya facturada). |
| `orden_servicio_pendiente_factura` | Se cerró con O.S; se está consultando el estado de facturación hasta que esté facturada. |
| `null`                             | Sin sub-estado de facturación. |

---

## 5. Tabla opportunity_service_order

Cada O.S asociada a una oportunidad se guarda en la tabla `opportunity_service_order`:

| Columna                | Tipo      | Descripción |
| ---------------------- | --------- | ----------- |
| id                     | SERIAL    | PK          |
| opportunity_id         | varchar(17) | ID oportunidad en CRM |
| service_order_id       | integer   | ID orden de servicio (sistema externo) |
| metadata               | text (JSON) | Metadata opcional |
| facturado              | boolean   | Si ya se obtuvo facturado=true del API |
| invoice_result_head_id | integer   | ID cabecera en invoice-mifact (cuando facturado) |
| url_soles              | text      | URL comprobante soles (cuando facturado) |
| url_dolares            | text      | URL comprobante dólares (cuando facturado) |
| last_checked_at        | timestamptz | Última consulta al API |
| created_at / updated_at| timestamptz | Auditoría |

El backend consulta **GET** `{URL_INVOICE_MIFACT_V3}/service-order/:serviceOrderId/invoice-status` para cada O.S con `facturado = false` (en cada llamada al endpoint y en el cron cada 5 minutos).

---

## 6. API de estado de facturación (invoice-mifact-v3)

### 6.1 Uso en el CRM

- **Variable de entorno:** `URL_INVOICE_MIFACT_V3` (URL base del servicio, ej. `http://localhost:5111/api`).
- **Login:** El API requiere autenticación. El CRM obtiene un token antes de consultar invoice-status:
  - **POST** `{URL_INVOICE_MIFACT_V3}/auth/signin` con cuerpo `{ "username": "...", "password": "..." }`.
  - Por defecto se usan `USERNAME_ADMIN` y `PASSWORD_ADMIN`. Si el servicio de facturación usa otras credenciales, definir `INVOICE_MIFACT_USERNAME` e `INVOICE_MIFACT_PASSWORD` en `.env`.
- **Métodos en backend:** `SvServices.getTokenInvoiceMifact()` (obtiene el token), `SvServices.getInvoiceStatusByServiceOrderId(serviceOrderId, token?)` (consulta estado; si no se pasa token, se obtiene con login).
- Las peticiones a **GET** `.../service-order/:id/invoice-status` se envían con cabecera `Authorization: Bearer <token>`.

### 6.2 Contrato del endpoint externo

**GET** `{base}/service-order/:serviceOrderId/invoice-status`

- **Parámetro:** `serviceOrderId` (número, ID de la orden de servicio).
- **Respuesta – no facturada:**
  ```json
  { "facturado": false }
  ```
- **Respuesta – facturada:**
  ```json
  {
    "facturado": true,
    "urls": { "soles": "...", "dolares": "..." },
    "invoice_result_head_id": 123
  }
  ```
  `urls` incluye solo las que existan (soles y/o dólares). Se toma el último comprobante válido (excluyendo status_invoice 105 y 107).

Cuando el CRM recibe `facturado: true` y `urls`, descarga los PDF desde esas URLs, los asocia a la oportunidad, actualiza la fila en `opportunity_service_order`, marca la oportunidad con `isPresaved = false` y `cFacturacionSubEstado = factura_directa`.

---

## 7. Cron de consulta

Un cron ejecuta cada **5 minutos** la revisión de todas las oportunidades que tienen O.S con `facturado = false`. Para cada una se llama al endpoint de invoice-status; si alguna O.S pasa a facturada, se descargan las URLs y se actualiza la oportunidad como en el flujo anterior.

---

## 8. Qué debe enviar el front

### 8.1 Solo actualizar datos y/o cita (sin cerrar)

- Datos main y/o cita según el caso.
- Si hay cita: `reservationId` obligatorio.
- `cFacturas`: puede omitirse o `{ comprobante_soles: null, comprobante_dolares: null }`.
- No enviar `cOrdenesServicio` si no se quiere cerrar con O.S.

### 8.2 Cierre ganado con factura directa

- Datos main (incluido `cClinicHistory`).
- Opcionalmente datos de cita + `reservationId`.
- **cFacturas** con al menos una URL válida y descargable:
  ```json
  "cFacturas": {
    "comprobante_soles": "https://...",
    "comprobante_dolares": null
  }
  ```

### 8.3 Cierre ganado con O.S

- Datos main (incluido `cClinicHistory`).
- Opcionalmente datos de cita + `reservationId`.
- **cOrdenesServicio**: array de IDs de orden de servicio, ej. `[456]`.
- Opcional: **cOrdenesServicioMetadata**: `{ "456": { "descripcion": "...", "numero_os": "..." } }`.

No es necesario enviar `cFacturas`; el backend consulta el estado de facturación y, cuando la O.S esté facturada, descarga las URLs y completa el cierre.

---

## 9. Respuesta del endpoint

**Respuesta (200):**

```json
{
  "success": true,
  "message": "Opportunity updated successfully",
  "opportunity": { ... }
}
```

`opportunity` es la entidad oportunidad actualizada (incluidos `stage`, `cFacturacionSubEstado`, etc.). Si en la misma petición se detectó que una O.S pasó a facturada, la oportunidad ya vendrá con `isPresaved: false` y `cFacturacionSubEstado: "factura_directa"`.

**Errores (400):** por ejemplo si se envían datos de cita sin `reservationId`:  
`{ "statusCode": 400, "message": "El campo reservationId no puede estar vacío" }`

---

## 10. Migración de base de datos

La tabla `opportunity_service_order` y la columna `opportunity.c_facturacion_sub_estado` se crean con la migración TypeORM:

- **Archivo:** `migraciones/1738685000000-OpportunityServiceOrderAndFacturacionSubEstado.ts`
- **Ejecutar:** `npm run migration:run`
- **Revertir:** `npm run migration:revert`

---

*Documentación generada para el backend CRM. Las fechas en respuestas pueden venir formateadas por el backend (ej. `yyyy-MM-dd HH:mm:ss`).*
