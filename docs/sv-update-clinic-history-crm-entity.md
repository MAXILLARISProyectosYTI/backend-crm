# Mensaje para el backend SV: actualizar entidad en PUT update-clinic-history-crm

**Destinatario:** equipo del backend SV (sistema vertical).

---

Cuando el CRM llama al endpoint:

**PUT** `{URL_BACK_SV}/opportunities/update-clinic-history-crm/:espoId`

el backend SV **debe actualizar la entidad/tabla** donde se almacenan los datos de “clinic history CRM” asociados a la oportunidad identificada por `espoId` (UUID de la oportunidad en el CRM).

---

## Payload que envía el CRM

Cuerpo de la petición (campos opcionales; solo se envían los que aplican en cada flujo):

| Campo           | Tipo   | Descripción                                      |
|-----------------|--------|--------------------------------------------------|
| `id_reservation`| number | ID de la reserva (cita) en SV.                   |
| `patientId`     | number | ID del paciente en SV (ch_id de historia clínica). |
| `id_payment`    | number | ID del pago/IRH en SV (cuando hay factura).       |

---

## Requerimiento

**El backend SV debe persistir estos valores en la entidad/tabla correspondiente** (por ejemplo la que relaciona oportunidad CRM con reserva, paciente y pago en SV). Es decir, al recibir el PUT con `espoId` y el payload anterior, SV debe **actualizar** el registro asociado a ese `espoId` con los campos enviados (`id_reservation`, `patientId`, `id_payment`), de modo que quede reflejado que la oportunidad ya tiene reservación, paciente y/o pago vinculados.

---

## GET full-flow-data (para redirect con flujo completo)

Para que el redirect del CRM devuelva **reserva** y **pago** cuando el flujo está completo, el CRM consulta:

**GET** `{URL_BACK_SV}/opportunities/full-flow-data/:opportunityId`

- **Headers:** `Authorization: Bearer {tokenSv}` (token admin o de usuario).
- **Parámetro de ruta:** `opportunityId` = UUID de la oportunidad en el CRM (espo_id en `clinic_history_crm`).

**Respuesta esperada:** objeto con `reservation` y/o `payment` (los que existan para esa oportunidad según `clinic_history_crm`):

```json
{
  "data": {
    "reservation": { "id": 164285, "date": "2026-03-06", "appointment": "17:15 - 17:45", ... },
    "payment": { "id": 39982, "url_invoice_soles": "...", ... }
  }
}
```

o en la raíz:

```json
{
  "reservation": { ... },
  "payment": { ... }
}
```

- Si existe `id_reservation` en `clinic_history_crm` para ese `espo_id`, incluir el objeto **reservation** (detalle de la reserva).
- Si existe `id_payment` en `clinic_history_crm` para ese `espo_id`, incluir el objeto **payment** (detalle del pago/factura).
- Si no hay registro en `clinic_history_crm` o no hay esos IDs, devolver `{}` o sin esos campos.

Con esto el CRM puede devolver en el redirect todo el flujo completo (dataPatient, reservation, payment, ordenesServicio) cuando el proceso está completado.

---

## Importante: cuando ya está facturado

Si la oportunidad **ya está facturada** (en `clinic_history_crm` ya existe `id_reservation` y/o `id_payment`, o hay órdenes de servicio facturadas), el backend SV **debe traer y devolver bien** los datos de **reservation** y **payment** en:

- **GET** `opportunities/full-flow-data/:opportunityId`, y/o  
- **GET** `opportunities/redirect-by-opportunity-id/:opportunityId`,

según corresponda, para que el CRM reciba el flujo completo y no quede faltando reserva o pago en la respuesta. Es decir: cuando el registro en `clinic_history_crm` (o la orden de servicio asociada) ya tiene reserva y pago vinculados, la respuesta debe incluir siempre los objetos `reservation` y `payment` con el detalle correcto.

---

*Documento generado desde el CRM para indicar al backend SV que debe actualizar dicha entidad al recibir el endpoint de update-clinic-history-crm.*
