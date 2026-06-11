import { Logger } from '@nestjs/common';
import { Repository, type FindOptionsWhere } from 'typeorm';
import { CommissionPeriod } from '../commission-period.entity';
import { CommissionRecord } from '../commission-record.entity';
import { CommissionType } from '../commission-type.entity';
import { CommissionDetail } from '../commission-detail.entity';
import { CommissionClosureTag } from '../commission-closure-tag.entity';

export interface ContractSvRow {
  contractId: number;
  quotationId: number;
  tratamiento: string;
  modalidad: string;
  cuotaNum: number;
  ejecutivo: string;
  ejecutivoNombre?: string | null;
  campusId: number;
  campusNombre: string;
  contractDate: string;
  firstPaymentDate: string | null;
}

export interface CierreTtoBonusConfig {
  personalThreshold: number;
  personalAmount: number;
  teamThreshold: number;
  teamAmount: number;
}

export interface CierreTtoSedeConfig {
  /** userId → sede principal (equipo cerradoras) */
  homeCampusByUser: Map<string, number>;
  /** `${userId}__${campusId}` → factor (0.20 = 20% en sede de apoyo) */
  apoyoFactorByUserCampus: Map<string, number>;
}

export interface CierreTtoResult {
  userId: string;
  userName: string;
  campusId: number;
  campusNombre: string;
  comisionTotal: number;
  comisionTtos: number;
  comisionBono: number;
  cantidadCierres: number;
  details: Array<{
    contractId: number;
    commissionTypeCode: string;
    importe: number;
    timing: string;
    modifier: string | null;
  }>;
  pendingTagCount: number;
}

const logger = new Logger('CierreTtoEngine');

function deriveTiming(contractDate: string, firstPaymentDate: string | null): 'MISMO_DIA' | 'DIFERIDO' | null {
  if (!firstPaymentDate) return null;
  const created = new Date(contractDate).setHours(0, 0, 0, 0);
  const paid = new Date(firstPaymentDate).setHours(0, 0, 0, 0);
  const diffDays = (paid - created) / (1000 * 60 * 60 * 24);
  return diffDays > 2 ? 'DIFERIDO' : 'MISMO_DIA';
}

function buildTypeCode(
  tratamiento: string,
  modalidad: string,
  timing: 'MISMO_DIA' | 'DIFERIDO',
  modifier: 'DOBLE' | 'MAS_50' | null,
  cuotaNum: number,
): string {
  const tto = ['OFM', 'ALINEADORES'].includes(tratamiento.toUpperCase()) ? 'OFM' : tratamiento.toUpperCase();

  if (tto === 'MARPE' && modalidad === 'CUOTAS' && cuotaNum === 8) {
    return timing === 'MISMO_DIA' ? 'MARPE_CUOTAS_MISMO_DIA' : 'MARPE_CUOTAS_DIFERIDO';
  }

  if (tto === 'OFM' && modalidad === 'CUOTAS' && cuotaNum === 8) {
    return timing === 'MISMO_DIA' ? 'OFM_CUOTAS_MISMO_DIA' : 'OFM_CUOTAS_DIFERIDO';
  }

  const isEscalaCuotas = modalidad === 'CUOTAS' && cuotaNum >= 1 && cuotaNum <= 14;

  if (isEscalaCuotas) {
    const timingPart = timing === 'MISMO_DIA' ? 'MD' : 'DF';
    if (modifier === 'MAS_50') {
      return `${tto}_CUOTAS_${timingPart}_C${cuotaNum}_MAS50`;
    }
    return `${tto}_CUOTAS_${timingPart}_C${cuotaNum}`;
  }

  const parts: string[] = [tto, modalidad, timing === 'MISMO_DIA' ? 'MISMO_DIA' : 'DIFERIDO'];
  if (modifier) parts.push(modifier === 'MAS_50' ? 'MAS50' : modifier);
  return parts.join('_');
}

function resolveAmount(
  code: string,
  commType: CommissionType | undefined,
  rateByCode: Map<string, number>,
): number {
  if (rateByCode.has(code)) return rateByCode.get(code)!;
  return commType ? Number(commType.amount) : 0;
}

/** Factor de comisión según sede principal vs sede de apoyo. */
export function resolveSedeApoyoFactor(
  userId: string,
  contractCampusId: number,
  sedeConfig?: CierreTtoSedeConfig,
): number {
  if (!sedeConfig) return 1;
  const home = sedeConfig.homeCampusByUser.get(userId);
  if (home != null && home === contractCampusId) return 1;
  const apoyoKey = `${userId}__${contractCampusId}`;
  const apoyo = sedeConfig.apoyoFactorByUserCampus.get(apoyoKey);
  if (apoyo != null && apoyo > 0) return apoyo;
  return 1;
}

export async function calculateCierreTto(
  period: CommissionPeriod,
  contracts: ContractSvRow[],
  typeRepo: Repository<CommissionType>,
  recordRepo: Repository<CommissionRecord>,
  detailRepo: Repository<CommissionDetail>,
  tagRepo: Repository<CommissionClosureTag>,
  rateByCode: Map<string, number> = new Map(),
  bonusConfig?: CierreTtoBonusConfig,
  sedeConfig?: CierreTtoSedeConfig,
): Promise<CierreTtoResult[]> {
  const types = await typeRepo.find({ where: { area: 'CIERRE_TTO', active: true } });
  const typeByCode = new Map(types.map((t) => [t.code, t]));

  const tags = await tagRepo.find({ where: { period: { id: period.id } } });
  const tagByContract = new Map(tags.map((t) => [t.contractId, t]));

  const byExecutive = new Map<string, ContractSvRow[]>();
  for (const c of contracts) {
    const key = `${c.ejecutivo}__${c.campusId}`;
    if (!byExecutive.has(key)) byExecutive.set(key, []);
    byExecutive.get(key)!.push(c);
  }

  const bonus = bonusConfig ?? {
    personalThreshold: Number(period.bonoPersonalTtosThreshold ?? 45),
    personalAmount: Number(period.bonoPersonalAmount ?? 500),
    teamThreshold: Number(period.bonoEquipoTtosThreshold ?? 75),
    teamAmount: Number(period.bonoEquipoAmount ?? 1000),
  };

  const results: CierreTtoResult[] = [];
  const ttosByCampus = new Map<number, number>();

  for (const [key, rows] of byExecutive) {
    const [userId, campusIdStr] = key.split('__');
    const campusId = parseInt(campusIdStr, 10);
    const campusNombre = rows[0].campusNombre;
    const userName = rows[0].ejecutivoNombre ?? userId;
    const sedeFactor = resolveSedeApoyoFactor(userId, campusId, sedeConfig);

    let comisionTtos = 0;
    let pendingTagCount = 0;
    const details: CierreTtoResult['details'] = [];

    const existingRecord = await recordRepo.findOne({
      where: { period: { id: period.id }, userId, campusId },
      relations: ['period'],
    });
    const record = existingRecord ?? recordRepo.create({
      period,
      userId,
      userName,
      campusId,
      campusNombre,
      factorEspecial: 1,
    });

    const existingDetails: CommissionDetail[] = [];

    for (const contract of rows) {
      if (contract.tratamiento?.toUpperCase() === 'CAMBIO') {
        const cambioType = typeByCode.get('CAMBIO_TTO');
        const importeBase = resolveAmount('CAMBIO_TTO', cambioType, rateByCode);
        const importe = Math.round(importeBase * sedeFactor * 100) / 100;
        if (importe > 0 && cambioType) {
          comisionTtos += importe;
          details.push({ contractId: contract.contractId, commissionTypeCode: 'CAMBIO_TTO', importe, timing: 'N/A', modifier: null });
          existingDetails.push(detailRepo.create({
            commissionType: cambioType,
            contractId: contract.contractId,
            quotationId: contract.quotationId,
            cantidad: 1,
            importeUnitario: importe,
            importeTotal: importe,
          }));
        }
        continue;
      }

      const tag = tagByContract.get(contract.contractId);
      const paymentRef = contract.firstPaymentDate ?? contract.contractDate;
      const timing = tag?.timing ?? deriveTiming(contract.contractDate, paymentRef);
      const modifier = tag?.modifier ?? null;

      if (!timing) {
        pendingTagCount++;
        logger.warn(`Contrato ${contract.contractId} sin timing determinable — queda PENDIENTE_CLASIFICACION`);
        continue;
      }

      const code = buildTypeCode(contract.tratamiento, contract.modalidad, timing, modifier, contract.cuotaNum);
      const commType = typeByCode.get(code);
      const importeBase = resolveAmount(code, commType, rateByCode);
      const importe = Math.round(importeBase * sedeFactor * 100) / 100;

      if (importe <= 0 || !commType) {
        logger.warn(`Sin tipo/monto de comisión para código "${code}" (contrato ${contract.contractId})`);
        pendingTagCount++;
        continue;
      }

      comisionTtos += importe;
      details.push({ contractId: contract.contractId, commissionTypeCode: code, importe, timing, modifier });
      existingDetails.push(detailRepo.create({
        commissionType: commType,
        contractId: contract.contractId,
        quotationId: contract.quotationId,
        cantidad: 1,
        importeUnitario: importe,
        importeTotal: importe,
      }));
    }

    const cantidadCierres = details.length;
    ttosByCampus.set(campusId, (ttosByCampus.get(campusId) ?? 0) + cantidadCierres);

    const personalBonus = cantidadCierres >= bonus.personalThreshold ? bonus.personalAmount : 0;
    const comisionBono = personalBonus;
    const comisionTotal = Math.round((comisionTtos + comisionBono) * 100) / 100;

    record.userName = userName;
    record.campusNombre = campusNombre;
    record.porcentajeSedeApoyo = sedeFactor;
    record.cantidadUnidades = cantidadCierres;
    record.comisionTtos = Math.round(comisionTtos * 100) / 100;
    record.comisionBono = comisionBono;
    record.comisionTotal = comisionTotal;
    record.estado = 'CALCULADO';

    const savedRecord = await recordRepo.save(record);
    await detailRepo.delete({ record: { id: savedRecord.id } });
    for (const det of existingDetails) {
      det.record = savedRecord;
    }
    if (existingDetails.length > 0) {
      await detailRepo.save(existingDetails);
    }

    results.push({
      userId,
      userName,
      campusId,
      campusNombre,
      comisionTtos: record.comisionTtos,
      comisionBono,
      comisionTotal,
      cantidadCierres,
      details,
      pendingTagCount,
    });
  }

  for (const r of results) {
    const teamTotal = ttosByCampus.get(r.campusId) ?? 0;
    if (teamTotal >= bonus.teamThreshold && bonus.teamAmount > 0) {
      const teamBonus = bonus.teamAmount;
      r.comisionBono = Math.round((r.comisionBono + teamBonus) * 100) / 100;
      r.comisionTotal = Math.round((r.comisionTtos + r.comisionBono) * 100) / 100;

      const recordWhere: FindOptionsWhere<CommissionRecord> = {
        period: { id: period.id },
        userId: r.userId,
        campusId: r.campusId,
      };
      const rec = await recordRepo.findOne({ where: recordWhere, relations: ['period'] });
      if (rec) {
        rec.comisionBono = r.comisionBono;
        rec.comisionTotal = r.comisionTotal;
        await recordRepo.save(rec);
      }
    }
  }

  return results;
}
