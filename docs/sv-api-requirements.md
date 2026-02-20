# Contrato API con el sistema SV (cotizaciones)

**La asignación de cerradora la define este sistema (CRM); SV solo expone el listado.**

---

## 1. GET /quotation/list

- **Controlador:** `quotation.controller.ts`
- **Ruta:** `GET /quotation/list`
- **Protección:** JwtAuthGuard (header `Authorization: Bearer {tokenSv}`).

### Query params

| Parámetro  | Tipo   | Requerido | Descripción |
|------------|--------|-----------|-------------|
| `page`     | number | No        | Página; por defecto 1. |
| `limit`    | number | No        | Registros por página (máx. 500); por defecto 50. |
| `dateFrom` | string | No        | Fecha desde (YYYY-MM-DD). |
| `dateTo`   | string | No        | Fecha hasta (YYYY-MM-DD). |
| `status`   | number | No        | Estado de cotización (`q.state`). Si no se envía, se listan todas con `state <> 0`. |

### Respuesta (estructura mínima)

```json
{
  "data": [
    { "id": 1, "name": "ApellidoPaterno ApellidoMaterno Nombre", "history": "HC-001" }
  ],
  "total": 100,
  "page": 1,
  "totalPages": 1
}
```

- **data:** array de objetos con `id`, `name` (concatenación apellidos y nombre del paciente) e `history` (historia clínica para cruce con el CRM).
- **total:** total de registros que cumplen el filtro.
- **page:** página actual.
- **totalPages:** total de páginas.

### Servicio SV (quotation.service.ts)

- Método `getQuotationList(options)` con paginación (skip/take) y filtros opcionales.
- Por defecto solo cotizaciones con `state <> 0`; si se envía `status`, se filtra por `q.state = status`.
- Fechas: si se envían `dateFrom` y/o `dateTo`, se filtra por `q.date` en ese rango.

---

## 2. Búsqueda de cotizaciones (cuando el CRM no encuentra resultados)

Cuando el usuario busca en el listado de oportunidades cerradoras y **no hay resultados en el CRM** (p. ej. datos aún no migrados), el CRM consulta a SV para ofrecer resultados desde cotizaciones/pacientes y permitir agregarlos a la cola.

### Endpoint a implementar en SV

- **Método:** `GET`
- **Ruta sugerida:** `GET /quotation/search`
- **Headers:** `Authorization: Bearer {tokenSv}`.
- **Query params:**

| Parámetro | Tipo   | Requerido | Descripción |
|-----------|--------|-----------|-------------|
| `q`       | string | Sí        | Término de búsqueda (nombre, historia clínica, o criterio que SV defina). |

### Respuesta mínima

Misma estructura que el listado (objetos con `id`, `name`, `history` para cruce con CRM):

```json
{
  "data": [
    { "id": 1, "name": "ApellidoPaterno ApellidoMaterno Nombre", "history": "HC-001" }
  ]
}
```

- **data:** array de cotizaciones (o pacientes) que coinciden con `q`. Incluir al menos `id`, `name`, `history` para que el CRM pueda crear la oportunidad cerradora si existe oportunidad con esa historia clínica.

---

## 3. Sede por historia clínica (facturación)

Para mostrar la sede de atención correcta en el listado de oportunidades cerradoras, el CRM debe **consultar por historia clínica** (y no por `c_campus_atencion_id` de la oportunidad). La sede debe venir de los datos de **facturación** en SV.

### Endpoint a exponer en SV

- **Método:** `GET`
- **Ruta sugerida:** `GET /clinic-history/sede-by-clinic-history/:clinicHistory` (o bajo facturación/billing si la sede se obtiene de ahí).
- **Headers:** `Authorization: Bearer {tokenSv}`.
- **Parámetro de ruta:** `clinicHistory` — historia clínica del paciente.

### Respuesta mínima

Objeto con el nombre de la sede (y opcionalmente el id de campus):

```json
{ "campusId": 1, "campusName": "Lima" }
```

o solo:

```json
{ "campusName": "Lima" }
```

Si no hay dato para esa historia clínica o no aplica sede: 404 o `{}`; el CRM usará un valor por defecto (ej. "Lima").

---

## 4. Endpoints existentes

- **GET /quotation/search?q=:** búsqueda por término para cuando el CRM no tiene resultados; el CRM usa la respuesta para ofrecer "agregar desde SV".
- **GET /clinic-history/sede-by-clinic-history/:clinicHistory:** devuelve la sede (campus) por historia clínica (preferentemente desde facturación). El CRM la usa para `sedeAtencion` en oportunidades cerradoras.
- **GET /quotation/get-today:** se mantiene igual (últimos 90 días con reservas/tarifas específicas). No se modifica.
- **GET /quotation/list:** endpoint para “todas las cotizaciones” (o el subconjunto que defina el CRM con `page`, `limit` y filtros). La asignación de cerradora queda del lado del CRM; SV solo expone el listado.
