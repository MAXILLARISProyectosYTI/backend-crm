import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractPresave } from './contract-presave.entity';
import { ContractPresaveAudit } from './contract-presave-audit.entity';
import { CreateContractPresaveDto } from './dto/contract-presave.dto';
import { computeScheduleTotalsFromJson } from './contract-presave-audit.util';

@Injectable()
export class ContractPresaveService {
  constructor(
    @InjectRepository(ContractPresave)
    private contractPresaveRepository: Repository<ContractPresave>,
    @InjectRepository(ContractPresaveAudit)
    private contractPresaveAuditRepository: Repository<ContractPresaveAudit>,
  ) {}

  /**
   * Crear o actualizar un presave de contrato
   * Si ya existe uno con el mismo quotationId, lo actualiza
   */
  async createOrUpdate(dto: CreateContractPresaveDto): Promise<ContractPresave> {
    let presave = await this.contractPresaveRepository.findOne({
      where: { quotationId: dto.quotationId },
    });

    if (presave) {
      Object.assign(presave, dto);
      presave = await this.contractPresaveRepository.save(presave);
    } else {
      presave = await this.contractPresaveRepository.save(
        this.contractPresaveRepository.create(dto),
      );
    }

    await this.recordAudit(presave, dto, 'save');
    return presave;
  }

  /**
   * Obtener el presave de un contrato por quotationId
   */
  async findByQuotationId(quotationId: number): Promise<ContractPresave | null> {
    return this.contractPresaveRepository.findOne({
      where: { quotationId },
    });
  }

  /**
   * Historial de guardados (auditoría) por cotización, más reciente primero.
   */
  async findAuditByQuotationId(
    quotationId: number,
    limit = 50,
  ): Promise<ContractPresaveAudit[]> {
    return this.contractPresaveAuditRepository.find({
      where: { quotationId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /**
   * Eliminar el presave de un contrato
   */
  async delete(quotationId: number): Promise<void> {
    const presave = await this.contractPresaveRepository.findOne({
      where: { quotationId },
    });

    if (presave) {
      await this.recordAudit(
        presave,
        {
          quotationId,
          saveSource: 'delete',
          savedByUserId: undefined,
        },
        'delete',
      );
    }

    await this.contractPresaveRepository.delete({ quotationId });
  }

  private async recordAudit(
    presave: ContractPresave,
    dto: CreateContractPresaveDto,
    action: 'save' | 'delete',
  ): Promise<void> {
    const scheduleJson =
      dto.paymentScheduleEditable ?? presave.paymentScheduleEditable ?? null;
    const totals = computeScheduleTotalsFromJson(scheduleJson);

    const audit = this.contractPresaveAuditRepository.create({
      contractPresaveId: presave.id,
      quotationId: presave.quotationId,
      clinicHistoryId: presave.clinicHistoryId ?? dto.clinicHistoryId ?? null,
      action,
      saveSource: dto.saveSource ?? (action === 'delete' ? 'delete' : null),
      savedByUserId: dto.savedByUserId ?? null,
      contractType: presave.contractType ?? dto.contractType ?? null,
      paymentMethod: presave.paymentMethod ?? dto.paymentMethod ?? null,
      paymentsCount: presave.paymentsCount ?? dto.paymentsCount ?? null,
      contractAmount: presave.contractAmount ?? dto.contractAmount ?? null,
      scheduleTotalMontoFinal: totals.montoFinal,
      scheduleTotalDescuento: totals.descuento,
      paymentScheduleEditable: scheduleJson,
      registeredPayments:
        dto.registeredPayments ?? presave.registeredPayments ?? null,
      payloadJson: JSON.stringify({
        ...dto,
        contractPresaveId: presave.id,
        action,
      }),
    });

    await this.contractPresaveAuditRepository.save(audit);
  }
}
