# Fechas y zonas horarias – Diagnóstico y buenas prácticas

## 1. Diagnóstico del desfase (+3 h)

### Síntoma
Se reciben timestamps como `2026-02-03T21:49:22-05:00` cuando la hora real en Lima era ~18:09 (desfase de ~+3 h).

### Causas identificadas en el código

1. **Conversión incorrecta “Lima + 5” para “UTC”**  
   En varios sitios se usaba:
   ```ts
   DateTime.now().setZone("America/Lima").plus({ hours: 5 }).toJSDate()
   ```
   En Luxon, `.plus({ hours: 5 })` suma 5 horas **en la misma zona** (Lima).  
   Ejemplo: 18:09 Lima → 23:09 Lima (no 23:09 UTC).  
   Eso equivale a 04:09 UTC del día siguiente: se guarda un instante incorrecto (~+3 h respecto a 18:09 Lima = 23:09 UTC).

2. **Interpretación de strings sin zona**  
   En JS, `new Date("2026-02-03T21:49:22.000")` (sin `Z` ni offset) se interpreta como **hora local del servidor**.  
   Si el servidor no está en UTC, el instante guardado o mostrado puede ser erróneo.

3. **Sobrescritura de `createdAt`**  
   En el cron de reasignación se actualizaba `createdAt` con una fecha calculada con el mismo patrón Lima+5, alterando el instante real de creación.

4. **Interceptor global**  
   El `DateTimezoneInterceptor` convierte todos los `Date` a texto en Lima; está bien para mostrar, pero hay que asegurar que los `Date` que llegan sean siempre instantes UTC correctos.

### Resumen
- **Guardar:** se estaba guardando un instante equivocado (Lima+5 en lugar de UTC).
- **Mostrar:** si además el driver/DB devuelve strings sin `Z`, la interpretación como “local” puede sumar otro desfase.

---

## 2. Buenas prácticas

### En base de datos
- Usar **`timestamp with time zone`** (PostgreSQL: `timestamptz`). La BD guarda y devuelve instantes en UTC.
- No usar `timestamp without time zone` para “ahora” o eventos reales.

### En backend (Node/TypeScript)
- **Un solo instante:** representar “ahora” siempre como UTC (p. ej. `new Date()`).
- **Al guardar:** usar `new Date()` o `DateTime.utc().toJSDate()`; no sumar horas a la hora de Lima para “simular” UTC.
- **Al leer:** si el driver devuelve `Date`, es un instante UTC correcto. Si devuelve string ISO sin `Z`, tratarlo como UTC (p. ej. añadir `Z` o usar `moment.utc(str)`).
- **Al devolver a frontend:** convertir solo en la capa de presentación a la zona deseada (ej. `America/Lima`) y devolver ISO con offset (`-05:00`) o formato acordado.

### En frontend
- Mostrar siempre en zona del usuario (ej. Lima) usando la misma zona o `Intl`/luxon/dayjs con zona.
- No asignar manualmente el offset `-05:00` a un valor que ya esté en otra zona.

### Regla de oro
- **Guardar:** instante UTC (un único número/instante).
- **Mostrar:** convertir ese instante a la zona deseada solo al formatear.

---

## 3. Solución aplicada en este proyecto

### Guardar (BD)
- Todas las escrituras de “ahora” usan **`new Date()`** (UTC).
- No se usa `DateTime.now().setZone("America/Lima").plus({ hours: 5 })` para generar timestamps.
- No se actualiza `createdAt` en reasignaciones; solo `modifiedAt` y campos de asignación.

### Leer y formatear para API
- **`formatDateToLima(date)`** (moment-timezone):
  - Si `date` es `Date`: se considera instante UTC y se convierte a Lima.
  - Si es string ISO **con** `Z` u offset: se interpreta como instante y se convierte a Lima.
  - Si es string ISO **sin** `Z` ni offset: se interpreta como **UTC** (evitando la “hora local” del servidor) y luego se convierte a Lima.
- Salida: ISO en Lima, p. ej. `2026-02-03T18:09:00-05:00`.

### Ejemplos de código correctos (TypeScript)

```ts
// --- Guardar "ahora" en BD (siempre UTC) ---
const now = new Date();
await repo.save({ createdAt: now, modifiedAt: now });

// Con Luxon (equivalente)
import { DateTime } from 'luxon';
const now = DateTime.utc().toJSDate();
// o simplemente
const now = new Date();
```

```ts
// --- Formatear para mostrar en Lima (solo al devolver a cliente) ---
import moment from 'moment-timezone';
function formatDateToLima(date: Date | string | null | undefined): string | null {
  if (date == null) return null;
  const m = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(String(date).trim())
    ? moment.utc(date)  // sin Z → interpretar como UTC
    : moment(date);    // con Z o offset → instante correcto
  if (!m.isValid()) return null;
  return m.tz('America/Lima').format();
}
```

```ts
// --- Leer timestamp de BD (pg devuelve Date en UTC) ---
const row = await qb.getRawOne();
const instant = row.assigned_at instanceof Date ? row.assigned_at : new Date(row.assigned_at);
// Si en algún caso llegara string sin Z (poco común con timestamptz):
const instant = typeof row.assigned_at === 'string' && !/Z|[+-]\d{2}:\d{2}$/.test(row.assigned_at)
  ? new Date(row.assigned_at + 'Z')
  : new Date(row.assigned_at);
```

---

## 4. Resumen

| Acción           | Antes (incorrecto)                    | Ahora (correcto)        |
|------------------|----------------------------------------|-------------------------|
| Guardar “ahora”  | `Lima + 5` como “UTC”                 | `new Date()`            |
| Leer string sin Z| Interpretado como hora local servidor | Interpretado como UTC   |
| Mostrar en API   | Mismo instante mal guardado           | `formatDateToLima()`    |
| Actualizar reasignación | Sobrescribir `createdAt` con Lima+5 | No tocar `createdAt`    |

Con esto se evita el desfase y se mantiene un único criterio: **guardar en UTC, mostrar en Lima solo al formatear**.
