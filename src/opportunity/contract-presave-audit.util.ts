export function computeScheduleTotalsFromJson(scheduleJson?: string | null): {
  montoFinal: number;
  descuento: number;
} {
  if (!scheduleJson) {
    return { montoFinal: 0, descuento: 0 };
  }
  try {
    const items = JSON.parse(scheduleJson);
    if (!Array.isArray(items)) {
      return { montoFinal: 0, descuento: 0 };
    }
    return items.reduce(
      (acc, item) => {
        const amount = Number(item?.amount) || 0;
        const descuento = Number(item?.descuento) || 0;
        const montoFinal =
          item?.montoFinal != null ? Number(item.montoFinal) : Math.max(0, amount - descuento);
        return {
          montoFinal: acc.montoFinal + (Number.isFinite(montoFinal) ? montoFinal : 0),
          descuento: acc.descuento + (Number.isFinite(descuento) ? descuento : 0),
        };
      },
      { montoFinal: 0, descuento: 0 },
    );
  } catch {
    return { montoFinal: 0, descuento: 0 };
  }
}
