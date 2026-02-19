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

## 2. Endpoints existentes

- **GET /quotation/get-today:** se mantiene igual (últimos 90 días con reservas/tarifas específicas). No se modifica.
- **GET /quotation/list:** endpoint nuevo para “todas las cotizaciones” (o el subconjunto que defina el CRM con `page`, `limit` y filtros). La asignación de cerradora queda del lado del CRM; SV solo expone el listado.
