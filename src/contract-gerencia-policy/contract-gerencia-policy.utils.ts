export const OFM_POLICY_MIN = { contado: 3000, cuotas: 3450 } as const;
export const OFM_GERENCIA_BAND = { contado: 2900, cuotas: 3350 } as const;
export const OFM_BONO_MAX_USD = 1800;

function clampOfmBonoMonto(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(OFM_BONO_MAX_USD, Math.round(raw * 100) / 100);
}

export function ofmSumaReferenciaPolitica(
  suma: number,
  ofmContratoBono?: boolean,
  montoBonoOfm?: number,
): number {
  if (!ofmContratoBono) return suma;
  const bono = clampOfmBonoMonto(montoBonoOfm ?? 0);
  if (bono <= 0) return suma;
  return Math.round((suma + bono) * 100) / 100;
}

export type GerenciaPolicyKind = 'none' | 'gerencia_band' | 'blocked';

export function evaluarPoliticaDesgloseOFM(
  paymentMethod: 'Al contado' | 'En cuotas',
  suma: number,
  ofmContratoBono?: boolean,
  montoBonoOfm?: number,
): { kind: GerenciaPolicyKind; policyMin: number; bandMin: number } {
  const isContado = paymentMethod === 'Al contado';
  const policyMin = isContado ? OFM_POLICY_MIN.contado : OFM_POLICY_MIN.cuotas;
  const bandMin = isContado ? OFM_GERENCIA_BAND.contado : OFM_GERENCIA_BAND.cuotas;

  const referencia = ofmSumaReferenciaPolitica(suma, ofmContratoBono, montoBonoOfm);

  if (referencia <= 0) {
    return { kind: 'none', policyMin, bandMin };
  }
  if (referencia < bandMin) {
    return { kind: 'blocked', policyMin, bandMin };
  }
  if (referencia < policyMin) {
    return { kind: 'gerencia_band', policyMin, bandMin };
  }
  return { kind: 'none', policyMin, bandMin };
}
