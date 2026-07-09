import {
  resolveOfmModality,
  ofmDetailIsMoldes,
  ofmDetailIsInicial,
  ofmDetailIsCuotaInstallment,
  ofmDetailIsPrimerPago,
  ofmDetailIsUnicoPago,
  ofmPrimerPagoStatusSelect,
  ofmHistoricalPrimerPagoInvoicedSelect,
} from './ofm-contract-detail-sql';

describe('ofm-contract-detail-sql', () => {
  describe('resolveOfmModality', () => {
    it('prioriza OFM_CUOTAS sobre contract_type CONTADO', () => {
      expect(resolveOfmModality('OFM_CUOTAS', 'CONTADO')).toEqual({
        isCuotas: true,
        isContado: false,
      });
    });

    it('prioriza OFM_CONTADO sobre contract_type CUOTAS', () => {
      expect(resolveOfmModality('OFM_CONTADO', 'CUOTAS')).toEqual({
        isCuotas: false,
        isContado: true,
      });
    });

    it('usa contract_type si treatment_code no es OFM explícito', () => {
      expect(resolveOfmModality('', 'CUOTAS')).toEqual({
        isCuotas: true,
        isContado: false,
      });
    });
  });

  describe('SQL predicates', () => {
    it('genera fragmentos SQL estables para clasificación SV', () => {
      expect(ofmDetailIsMoldes('cd')).toContain("= 'moldes'");
      expect(ofmDetailIsInicial('cd')).toContain("'inicial'");
      expect(ofmDetailIsCuotaInstallment('cd')).toContain("= 'cuota'");
      expect(ofmDetailIsPrimerPago('cd')).toContain('OR');
      expect(ofmDetailIsUnicoPago('cd')).toContain('único pago');
    });
  });

  describe('ofmHistoricalPrimerPagoInvoicedSelect', () => {
    it('incluye primer_pago_invoiced_usd y único pago en cuotas', () => {
      const sql = ofmHistoricalPrimerPagoInvoicedSelect('2628');
      expect(sql).toContain('primer_pago_invoiced_usd');
      expect(sql).toContain('unico pago');
      expect(sql).toContain('OFM_CUOTAS');
    });
  });

  describe('ofmPrimerPagoStatusSelect', () => {
    it('por defecto exige state activo', () => {
      const sql = ofmPrimerPagoStatusSelect();
      expect(sql).toContain('COALESCE(cd.state, 1) = 1');
    });

    it('con includeInactive no filtra state (sobrevive cuotas→contado)', () => {
      const sql = ofmPrimerPagoStatusSelect(undefined, { includeInactive: true });
      expect(sql).toContain('TRUE');
      expect(sql).not.toContain('COALESCE(cd.state, 1) = 1');
    });
  });

  describe('referrer eligibility (cuotas)', () => {
    it('primer pago status cubre moldes e inicial por separado', () => {
      const sql = ofmPrimerPagoStatusSelect('c.idclinichistory = $1', { includeInactive: true });
      expect(sql).toContain('moldes_complete');
      expect(sql).toContain('inicial_complete');
      expect(sql).toContain('has_moldes');
      expect(sql).toContain('has_inicial');
    });
  });
});
