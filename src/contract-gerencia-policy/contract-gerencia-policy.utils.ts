export const OFM_POLICY_MIN = { contado: 3000, cuotas: 3450 } as const;
export const OFM_GERENCIA_BAND = { contado: 2900, cuotas: 3350 } as const;

export type GerenciaPolicyKind = 'none' | 'gerencia_band' | 'blocked';

export function evaluarPoliticaDesgloseOFM(
  paymentMethod: 'Al contado' | 'En cuotas',
  suma: number,
): { kind: GerenciaPolicyKind; policyMin: number; bandMin: number } {
  const isContado = paymentMethod === 'Al contado';
  const policyMin = isContado ? OFM_POLICY_MIN.contado : OFM_POLICY_MIN.cuotas;
  const bandMin = isContado ? OFM_GERENCIA_BAND.contado : OFM_GERENCIA_BAND.cuotas;

  if (suma <= 0) {
    return { kind: 'none', policyMin, bandMin };
  }
  if (suma < bandMin) {
    return { kind: 'blocked', policyMin, bandMin };
  }
  if (suma < policyMin) {
    return { kind: 'gerencia_band', policyMin, bandMin };
  }
  return { kind: 'none', policyMin, bandMin };
}
