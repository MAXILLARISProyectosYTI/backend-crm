export interface OiCrmUserMetrics {
  facturadoConIgv: number;
  evaluaciones: number;
}

/** Agrega filas SV en mapa login → métricas. */
export function mergeOiCrmMetricsRow(
  map: Map<string, OiCrmUserMetrics>,
  userId: string,
  patch: Partial<OiCrmUserMetrics>,
): void {
  const key = userId.trim().toLowerCase();
  if (!key) return;
  const prev = map.get(key) ?? { facturadoConIgv: 0, evaluaciones: 0 };
  map.set(key, {
    facturadoConIgv: patch.facturadoConIgv != null
      ? prev.facturadoConIgv + patch.facturadoConIgv
      : prev.facturadoConIgv,
    evaluaciones: patch.evaluaciones != null
      ? prev.evaluaciones + patch.evaluaciones
      : prev.evaluaciones,
  });
}
