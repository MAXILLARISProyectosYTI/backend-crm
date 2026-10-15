import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserService } from 'src/user/user.service';
import { ContractGerenciaBandUsage } from './contract-gerencia-band-usage.entity';
import { ConfirmGerenciaBandDto } from './dto/confirm-gerencia-band.dto';
import { evaluarPoliticaDesgloseOFM } from './contract-gerencia-policy.utils';

const DEFAULT_MONTHLY_LIMIT = 5;

@Injectable()
export class ContractGerenciaPolicyService {
  constructor(
    @InjectRepository(ContractGerenciaBandUsage)
    private readonly usageRepo: Repository<ContractGerenciaBandUsage>,
    private readonly userService: UserService,
  ) {}

  private getMonthlyLimit(): number {
    const raw = process.env.GERENCIA_BAND_MONTHLY_LIMIT;
    const n = raw ? parseInt(raw, 10) : DEFAULT_MONTHLY_LIMIT;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_LIMIT;
  }

  private getApproverUserNames(): string[] {
    const raw =
      process.env.GERENCIA_BAND_APPROVER_USERNAMES ||
      process.env.GERENCIA_BAND_APPROVER_USERNAME ||
      'alexanders.mollo';
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  private monthRangeLima(): { start: Date; end: Date } {
    const now = new Date();
    const limaOffsetMin = -5 * 60;
    const local = new Date(now.getTime() + (now.getTimezoneOffset() + limaOffsetMin) * 60000);
    const y = local.getFullYear();
    const m = local.getMonth();
    const startLocal = new Date(Date.UTC(y, m, 1, 5, 0, 0));
    const endLocal = new Date(Date.UTC(y, m + 1, 1, 5, 0, 0));
    return { start: startLocal, end: endLocal };
  }

  async countUsesThisMonth(requestedByUserId: string): Promise<number> {
    const { start, end } = this.monthRangeLima();
    return this.usageRepo
      .createQueryBuilder('u')
      .where('u.requested_by_user_id = :id', { id: requestedByUserId })
      .andWhere('u.created_at >= :start AND u.created_at < :end', { start, end })
      .getCount();
  }

  async getUsageSummary(requestedByUserId: string) {
    const usesThisMonth = await this.countUsesThisMonth(requestedByUserId);
    const monthlyLimit = this.getMonthlyLimit();
    return {
      usesThisMonth,
      monthlyLimit,
      usesRemaining: Math.max(0, monthlyLimit - usesThisMonth),
    };
  }

  private async validateApprover(userName: string, password: string) {
    const allowed = this.getApproverUserNames();
    const normalized = userName.trim().toLowerCase();
    if (!allowed.includes(normalized)) {
      throw new BadRequestException(
        'El usuario ingresado no está autorizado para aprobar este descuento.',
      );
    }

    const user = await this.userService.findByUserName(userName.trim());
    if (!user || user.deleted) {
      throw new BadRequestException('Credenciales de gerencia inválidas');
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      throw new BadRequestException('Credenciales de gerencia inválidas');
    }

    return user;
  }

  async confirmBandOverride(
    requestedByUserId: string,
    dto: ConfirmGerenciaBandDto,
  ) {
    const contractType = (dto.contractType || '').trim().toUpperCase();
    if (contractType !== 'OFM') {
      throw new BadRequestException(
        'La banda de descuento con gerencia solo aplica a contratos OFM.',
      );
    }

    const total = Number(dto.totalAmount);
    if (!Number.isFinite(total) || total <= 0) {
      throw new BadRequestException('Monto total inválido');
    }

    const policy = evaluarPoliticaDesgloseOFM(dto.paymentMethod, total);
    if (policy.kind === 'blocked') {
      throw new BadRequestException(
        `No es posible aplicar ese monto. El mínimo permitido es USD ${policy.policyMin.toFixed(2)} (política OFM).`,
      );
    }
    if (policy.kind !== 'gerencia_band') {
      throw new BadRequestException(
        'Este monto no requiere autorización de gerencia o supera la banda permitida.',
      );
    }

    const monthlyLimit = this.getMonthlyLimit();
    const usesThisMonth = await this.countUsesThisMonth(requestedByUserId);
    if (usesThisMonth >= monthlyLimit) {
      throw new BadRequestException(
        `Has alcanzado el límite de ${monthlyLimit} autorizaciones de gerencia este mes.`,
      );
    }

    const approver = await this.validateApprover(
      dto.approverUserName,
      dto.approverPassword,
    );

    const row = this.usageRepo.create({
      requestedByUserId,
      approverUserId: approver.id,
      quotationId: dto.quotationId,
      contractType,
      paymentMethod: dto.paymentMethod,
      totalAmount: total,
    });
    await this.usageRepo.save(row);

    const usesAfter = usesThisMonth + 1;
    return {
      success: true,
      usesThisMonth: usesAfter,
      monthlyLimit,
      usesRemaining: Math.max(0, monthlyLimit - usesAfter),
      message: `Autorización registrada (${usesAfter}/${monthlyLimit} este mes).`,
    };
  }
}
