import {
  resolveOfmModality,
  ofmDetailIsMoldes,
  ofmDetailIsInicial,
  ofmDetailIsCuotaInstallment,
  ofmDetailIsPrimerPago,
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
    });
  });
});
