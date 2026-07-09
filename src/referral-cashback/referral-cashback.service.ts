import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Opportunity } from '../opportunity/opportunity.entity';
import { ReferralCashbackBalance } from './entities/referral-cashback-balance.entity';
import { ReferralCashbackConfig } from './entities/referral-cashback-config.entity';
import { ReferralCashbackLedger } from './entities/referral-cashback-ledger.entity';
import {
  ReferralCashbackCurrency,
  ReferralCashbackLedgerType,
} from './enums/referral-cashback.enums';
import {
  ApplyReferralCashbackDto,
  ProcessInvoiceCashbackDto,
  UpdateReferralCashbackConfigDto,
} from './dto/referral-cashback.dto';
import { ReferralCashbackSvService, type ReferralCashbackSvSourceType } from './services/referral-cashback-sv.service';
import {
  CASHBACK_ACCOUNT_CURRENCY,
  convertCashbackAmountToUsd,
} from './utils/referral-cashback-currency.util';

export interface PendingReferralCashbackPhase {
  /** Etiqueta corta de la fase (ej. OFM cuotas — moldes + inicial). */
  treatmentLabel: string;
  sourceType?: string;
  cashbackPhase?: string;
  invoicedAmount: number;
  estimatedCashback: number;
  currency: ReferralCashbackCurrency;
  /** TC soles/USD de la factura cuando el pago fue en PEN. */
  exchangeRate?: number | null;
}

export interface PendingReferralCashbackItem {
  referredPatientId: number;
  referredPatientName: string | null;
  referredClinicHistory: string | null;
  referredOpportunityId: string | null;
  treatmentLabel: string;
  /** Base del 10%: factura de cierre o saldo pendiente estimado. */
  invoicedAmount: number;
  estimatedCashback: number;
  currency: ReferralCashbackCurrency;
  status: 'waiting_referrer_eligibility' | 'waiting_referral_contract' | 'ready_to_credit';
  contractTotal?: number;
  amountPaid?: number;
  amountPending?: number;
  progressPercent?: number;
  /** Desglose por fase (moldes+inicial, cierre contado, cuotas remainder). */
  phases?: PendingReferralCashbackPhase[];
  /** TC soles/USD cuando el pending proviene de factura en PEN. */
  exchangeRate?: number | null;
}

export interface ReferralCashbackProcessResult {
  status: 'skipped' | 'credited' | 'duplicate' | 'error';
  reason?: string;
  cashbackAmount?: number;
  currency?: ReferralCashbackCurrency;
  referrerPatientId?: number;
  ledgerId?: number;
}

export interface ProcessPendingForPatientResult {
  patientId: number;
  processed: number;
  credited: number;
  totalCashback: number;
  results: ReferralCashbackProcessResult[];
  titularReferrals?: ProcessPendingForPatientResult[];
}

@Injectable()
export class ReferralCashbackService {
  private readonly logger = new Logger(ReferralCashbackService.name);

  constructor(
    @InjectRepository(ReferralCashbackConfig)
    private readonly configRepo: Repository<ReferralCashbackConfig>,
    @InjectRepository(ReferralCashbackBalance)
    private readonly balanceRepo: Repository<ReferralCashbackBalance>,
    @InjectRepository(ReferralCashbackLedger)
    private readonly ledgerRepo: Repository<ReferralCashbackLedger>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepo: Repository<Opportunity>,
    private readonly svService: ReferralCashbackSvService,
  ) {}

  async getConfig(): Promise<ReferralCashbackConfig> {
    let config = await this.configRepo.findOne({ where: { active: true }, order: { id: 'ASC' } });
    if (!config) {
      config = this.configRepo.create({ defaultPercent: 10, active: true });
      config = await this.configRepo.save(config);
    }
    return config;
  }

  async updateConfig(dto: UpdateReferralCashbackConfigDto): Promise<ReferralCashbackConfig> {
    const config = await this.getConfig();
    if (dto.defaultPercent != null) config.defaultPercent = dto.defaultPercent;
    if (dto.expirationMonths != null) config.expirationMonths = dto.expirationMonths;
    if (dto.active != null) config.active = dto.active;
    if (dto.notes != null) config.notes = dto.notes;
    return this.configRepo.save(config);
  }

  async getBalanceByPatient(patientId: number) {
    await this.expireStaleCreditsForPatient(patientId);
    const balances = await this.balanceRepo.find({
      where: { patientId },
      order: { currency: 'ASC' },
    });
    const expirationMonths = await this.getExpirationMonths();
    const nextExpirationAt = await this.getNextExpirationAtForPatient(patientId);

    return {
      patientId,
      expirationMonths,
      nextExpirationAt,
      balances: balances.map((b) => ({
        currency: b.currency,
        availableAmount: Number(b.availableAmount),
        totalEarned: Number(b.totalEarned),
        totalUsed: Number(b.totalUsed),
      })),
    };
  }

  async getLedgerByPatient(patientId: number, limit = 50) {
    await this.expireStaleCreditsForPatient(patientId);
    const balances = await this.balanceRepo.find({ where: { patientId } });
    if (balances.length === 0) {
      return { patientId, entries: [] };
    }
    const balanceIds = balances.map((b) => b.id);
    const entries = await this.ledgerRepo
      .createQueryBuilder('l')
      .where('l.balance_id IN (:...balanceIds)', { balanceIds })
      .orderBy('l.created_at', 'DESC')
      .take(limit)
      .getMany();

    return {
      patientId,
      entries: entries.map((e) => ({
        id: e.id,
        entryType: e.entryType,
        amount: Number(e.amount),
        currency: e.currency,
        percentApplied: e.percentApplied != null ? Number(e.percentApplied) : null,
        referredOpportunityId: e.referredOpportunityId,
        referredPatientId: e.referredPatientId,
        sourceIrbId: e.sourceIrbId,
        applyContext: e.applyContext,
        createdAt: e.createdAt,
        expiresAt: e.expiresAt,
        metadata: e.metadata,
      })),
    };
  }

  /**
   * Vista unificada HC: saldo + ledger enriquecido + resumen por referido (1 request).
   */
  async getDashboardByPatient(patientId: number, limit = 30) {
    const [balancePayload, ledgerPayload, referrerEligible, expirationMonths, referrerEligibility] =
      await Promise.all([
        this.getBalanceByPatient(patientId),
        this.getLedgerByPatient(patientId, limit),
        this.svService.isPatientReferrerEligible(patientId),
        this.getExpirationMonths(),
        this.svService.getReferrerOfmEligibilityProgress(patientId),
      ]);

    const config = await this.getConfig();
    const percent = Number(config.defaultPercent);
    const [pendingEligibleRaw, pendingContract] = await Promise.all([
      this.buildPendingReferralCashback(patientId, percent),
      this.buildProspectiveReferralCashback(patientId, percent),
    ]);
    // Titular ya habilitado con IRB de referidos sin acreditar: no ocultarlos
    // (antes desaparecían del dashboard sin acreditarse) y auto-acreditar en background.
    const pendingEligible: PendingReferralCashbackItem[] = referrerEligible
      ? pendingEligibleRaw.map((item) => ({ ...item, status: 'ready_to_credit' as const }))
      : pendingEligibleRaw;
    const refOppsForHeal = referrerEligible
      ? await this.listReferralOpportunitiesForTitular(patientId)
      : [];
    // Reprocesar referidos: pending nuevo o top-up de primer tramo (cuotas→contado→cuotas).
    if (referrerEligible && (pendingEligible.length > 0 || refOppsForHeal.length > 0)) {
      this.triggerSelfHealCredit(patientId);
    }
    const pendingReferralCashback = [...pendingEligible, ...pendingContract];

    const referredPatientIds = [
      ...new Set(
        ledgerPayload.entries
          .map((e) => e.referredPatientId)
          .filter((id): id is number => id != null && Number.isFinite(id) && id > 0),
      ),
    ];
    const sourceIrbIds = [
      ...new Set(
        ledgerPayload.entries
          .map((e) => e.sourceIrbId)
          .filter((id): id is number => id != null && Number.isFinite(id) && id > 0),
      ),
    ];

    const [patientBriefs, irbDetails] = await Promise.all([
      this.svService.getClinicHistoryBriefs(referredPatientIds),
      this.svService.getIrbCashbackDetails(sourceIrbIds),
    ]);

    const entries = ledgerPayload.entries.map((entry) => {
      const meta = (entry.metadata ?? {}) as Record<string, unknown>;
      const sourceType = String(meta.sourceType ?? '');
      const irb = entry.sourceIrbId ? irbDetails.get(entry.sourceIrbId) : undefined;
      const referred =
        entry.referredPatientId != null
          ? patientBriefs.get(entry.referredPatientId)
          : undefined;

      const base = {
        ...entry,
        sourceType: sourceType || null,
        sourceLabel: this.sourceLabelFromMetadata(meta),
        referredPatientName: referred?.fullName ?? null,
        referredClinicHistory: referred?.history ?? null,
        invoicedAmount:
          meta.invoicedAmount != null ? Number(meta.invoicedAmount) : irb?.amount ?? null,
        treatmentLabel: irb?.treatmentLabel ?? null,
        serviceOrderId:
          irb?.serviceOrderId ??
          (meta.serviceOrderId != null && Number.isFinite(Number(meta.serviceOrderId))
            ? Number(meta.serviceOrderId)
            : null),
        invoicedAt: irb?.invoicedAt ?? null,
        creditedAt: entry.createdAt,
      };

      return this.enrichLedgerEntryForUsdDisplay(base, irb, meta);
    });

    const consolidatedBalance = this.buildConsolidatedUsdBalance(
      balancePayload.balances,
      entries,
    );
    const referredSummary = this.buildReferredSummary(entries);

    return {
      patientId,
      referrerEligible,
      referrerEligibility: referrerEligibility.hasOfmContract ? referrerEligibility : null,
      pendingReferralCashback,
      expirationMonths,
      nextExpirationAt: balancePayload.nextExpirationAt,
      displayCurrency: CASHBACK_ACCOUNT_CURRENCY,
      balances: [consolidatedBalance],
      entries,
      referredSummary,
    };
  }

  /**
   * Montos de cuenta siempre en USD; convierte ledger PEN con el TC de cada factura.
   */
  private enrichLedgerEntryForUsdDisplay<
    T extends {
      amount: number;
      currency: string;
      metadata?: Record<string, unknown> | null;
      invoicedAmount?: number | null;
      sourceIrbId?: number | null;
    },
  >(
    entry: T,
    irb?: { exchangeRate?: number | null; currency?: string; amount?: number },
    metaInput?: Record<string, unknown>,
  ) {
    const meta = metaInput ?? ((entry.metadata ?? {}) as Record<string, unknown>);
    const storedRate =
      meta.exchangeRate != null && Number.isFinite(Number(meta.exchangeRate))
        ? Number(meta.exchangeRate)
        : null;
    const irbRate =
      irb?.exchangeRate != null && Number.isFinite(irb.exchangeRate) && irb.exchangeRate > 0
        ? irb.exchangeRate
        : null;
    const exchangeRate = storedRate ?? irbRate;

    const originalCurrency = String(
      meta.originalCurrency ?? entry.currency ?? CASHBACK_ACCOUNT_CURRENCY,
    ) as ReferralCashbackCurrency;
    const originalAmount =
      meta.originalAmount != null && Number.isFinite(Number(meta.originalAmount))
        ? Number(meta.originalAmount)
        : entry.amount;

    const convertedPen = convertCashbackAmountToUsd(
      entry.amount,
      ReferralCashbackCurrency.PEN,
      exchangeRate,
    );
    const displayAmountUsd =
      entry.currency === ReferralCashbackCurrency.USD
        ? entry.amount
        : convertedPen ?? 0;

    const invoicedOriginal =
      meta.invoicedAmount != null
        ? Number(meta.invoicedAmount)
        : irb?.amount ?? entry.invoicedAmount ?? null;

    const isPrimerPagoTopUp = meta.primerPagoTopUp === true;

    let invoicedAmountUsd =
      meta.supplementalInvoicedUsd != null && Number.isFinite(Number(meta.supplementalInvoicedUsd))
        ? Number(meta.supplementalInvoicedUsd)
        : null;

    // Top-up: mostrar la base de ESTE pago (ej. $500), no el total del primer tramo ($644.09).
    if (invoicedAmountUsd == null && isPrimerPagoTopUp && irb?.amount != null) {
      const irbCurrency = (irb.currency ?? ReferralCashbackCurrency.USD) as ReferralCashbackCurrency;
      invoicedAmountUsd =
        irbCurrency === ReferralCashbackCurrency.USD
          ? irb.amount
          : convertCashbackAmountToUsd(irb.amount, ReferralCashbackCurrency.PEN, exchangeRate);
    }

    if (invoicedAmountUsd == null && !isPrimerPagoTopUp) {
      invoicedAmountUsd =
        meta.invoicedAmountUsd != null && Number.isFinite(Number(meta.invoicedAmountUsd))
          ? Number(meta.invoicedAmountUsd)
          : null;
    }

    if (invoicedAmountUsd == null && invoicedOriginal != null && !isPrimerPagoTopUp) {
      invoicedAmountUsd =
        originalCurrency === ReferralCashbackCurrency.USD
          ? invoicedOriginal
          : convertCashbackAmountToUsd(
              invoicedOriginal,
              ReferralCashbackCurrency.PEN,
              exchangeRate,
            );
    }

    return {
      ...entry,
      displayCurrency: CASHBACK_ACCOUNT_CURRENCY,
      displayAmountUsd: this.roundMoney(displayAmountUsd),
      exchangeRate:
        originalCurrency === ReferralCashbackCurrency.PEN && exchangeRate != null
          ? exchangeRate
          : null,
      originalCurrency:
        originalCurrency !== ReferralCashbackCurrency.USD ? originalCurrency : null,
      originalAmount:
        originalCurrency !== ReferralCashbackCurrency.USD ? originalAmount : null,
      invoicedAmountUsd:
        invoicedAmountUsd != null ? this.roundMoney(invoicedAmountUsd) : null,
      primerTramoTotalUsd:
        isPrimerPagoTopUp && meta.primerTramoTotalUsd != null
          ? this.roundMoney(Number(meta.primerTramoTotalUsd))
          : isPrimerPagoTopUp && meta.invoicedAmountUsd != null
            ? this.roundMoney(Number(meta.invoicedAmountUsd))
            : null,
      isPrimerPagoTopUp,
    };
  }

  private buildConsolidatedUsdBalance(
    balances: Array<{
      currency: string;
      availableAmount: number;
      totalEarned: number;
      totalUsed: number;
    }>,
    entries: Array<{
      entryType: string;
      currency: string;
      amount: number;
      displayAmountUsd?: number;
      exchangeRate?: number | null;
      metadata?: Record<string, unknown> | null;
    }>,
  ) {
    let availableUsd = 0;
    let totalEarnedUsd = 0;
    let totalUsedUsd = 0;

    const usdBalance = balances.find((b) => b.currency === ReferralCashbackCurrency.USD);
    if (usdBalance) {
      availableUsd += usdBalance.availableAmount;
      totalEarnedUsd += usdBalance.totalEarned;
      totalUsedUsd += usdBalance.totalUsed;
    }

    const penBalance = balances.find((b) => b.currency === ReferralCashbackCurrency.PEN);
    if (penBalance) {
      const penEntries = entries.filter((e) => e.currency === ReferralCashbackCurrency.PEN);
      for (const entry of penEntries) {
        const usd = entry.displayAmountUsd ?? 0;
        if (entry.entryType === ReferralCashbackLedgerType.EARNED) {
          totalEarnedUsd += usd;
        } else if (
          entry.entryType === ReferralCashbackLedgerType.USED
          || entry.entryType === ReferralCashbackLedgerType.EXPIRED
        ) {
          totalUsedUsd += usd;
        }
      }
      for (const entry of penEntries.filter(
        (e) => e.entryType === ReferralCashbackLedgerType.EARNED,
      )) {
        const meta = (entry.metadata ?? {}) as Record<string, unknown>;
        const remaining =
          meta.remainingAmount != null && Number.isFinite(Number(meta.remainingAmount))
            ? Number(meta.remainingAmount)
            : entry.amount;
        const remUsd =
          convertCashbackAmountToUsd(
            remaining,
            ReferralCashbackCurrency.PEN,
            entry.exchangeRate,
          ) ?? 0;
        availableUsd += remUsd;
      }
    }

    return {
      currency: CASHBACK_ACCOUNT_CURRENCY,
      availableAmount: this.roundMoney(availableUsd),
      totalEarned: this.roundMoney(totalEarnedUsd),
      totalUsed: this.roundMoney(totalUsedUsd),
    };
  }

  /**
   * Oportunidades REF-N del titular (CRM Ventas).
   */
  private async listReferralOpportunitiesForTitular(referrerPatientId: number) {
    const titularBriefs = await this.svService.getClinicHistoryBriefs([referrerPatientId]);
    const titularHc = titularBriefs.get(referrerPatientId)?.history?.trim();
    if (!titularHc) return [];

    const titularOpps = await this.opportunityRepo.find({
      where: {
        cClinicHistory: titularHc,
        cIsReferralCreation: false,
        deleted: false,
      },
    });
    const titularIds = titularOpps.map((o) => o.id).filter(Boolean);
    if (!titularIds.length) return [];

    return this.opportunityRepo.find({
      where: {
        cPrimaryOpportunityId: In(titularIds),
        cIsReferralCreation: true,
        deleted: false,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Referidos con pago OFM facturado cuyo cashback aún no se acreditó al titular
   * (típicamente porque el titular no completó su propio contrato OFM).
   *
   * Puede haber varias fases por el mismo referido (moldes+inicial y luego cierre
   * contado/cuotas). Se **suman** en un solo pending para que no se pierda el ~$260
   * al cambiar de modalidad y cerrar el resto.
   */
  private async buildPendingReferralCashback(
    referrerPatientId: number,
    percent: number,
  ): Promise<PendingReferralCashbackItem[]> {
    const refOpps = await this.listReferralOpportunitiesForTitular(referrerPatientId);
    const pending: PendingReferralCashbackItem[] = [];

    for (const refOpp of refOpps) {
      const referredPatientId = await this.svService.getPatientIdByOpportunityEspoId(refOpp.id);
      if (!referredPatientId) continue;

      const irbIds = await this.svService.listOfmCashbackTriggerIrbIdsForPatient(referredPatientId);
      if (!irbIds.length) continue;

      const phaseItems: PendingReferralCashbackItem[] = [];
      const seenPhases = new Set<string>();

      for (const sourceIrbId of irbIds) {
        const existing = await this.findEarnedEntryBySourceIrb(sourceIrbId);
        if (existing) continue;

        const ctx = await this.svService.getInvoiceCashbackContext(sourceIrbId);
        if (!ctx?.isEligible || ctx.invoicedAmount <= 0) continue;

        // Idempotencia por fase: no duplicar el mismo cashbackPhase del contrato
        const phaseKey = `${ctx.contractId ?? 'x'}:${ctx.cashbackPhase ?? ctx.sourceType}`;
        if (ctx.contractId && ctx.cashbackPhase) {
          const existingPhase = await this.findEarnedEntryByContractPhase(
            ctx.contractId,
            ctx.cashbackPhase,
          );
          if (existingPhase) continue;
        }
        if (seenPhases.has(phaseKey)) continue;
        seenPhases.add(phaseKey);

        let invoicedAmountUsd =
          ctx.invoicedAmountUsd
          ?? (ctx.currency === ReferralCashbackCurrency.USD
            ? ctx.invoicedAmount
            : convertCashbackAmountToUsd(
                ctx.invoicedAmount,
                ctx.currency,
                ctx.exchangeRate,
              ));
        if (invoicedAmountUsd == null || invoicedAmountUsd <= 0) continue;

        // Si el head de cierre contado incluye el primer pago histórico, restar esa base
        // (mismo criterio que processInvoicePayment). Si es solo "Único pago" restante, no restar.
        if (
          ctx.sourceType === 'OFM_CONTADO_COMPLETE'
          && ctx.contractId
          && ctx.closingIncludesPrimerPago
        ) {
          const priorInicial = await this.findEarnedEntryByContractPhase(
            ctx.contractId,
            'cuotas_inicial',
          );
          // También restar si el pending de esta misma pasada ya trae moldes+inicial
          const priorBaseFromPending = phaseItems
            .filter((p) => p.treatmentLabel.includes('moldes'))
            .reduce((s, p) => s + p.invoicedAmount, 0);
          const priorBaseUsd = Number(
            (priorInicial?.metadata as Record<string, unknown> | undefined)?.invoicedAmountUsd
            ?? (priorInicial?.metadata as Record<string, unknown> | undefined)?.invoicedAmount
            ?? 0,
          );
          const deduct = Math.max(priorBaseUsd, priorBaseFromPending);
          if (deduct > 0 && invoicedAmountUsd > deduct) {
            invoicedAmountUsd = this.roundMoney(invoicedAmountUsd - deduct);
          }
        }

        const estimatedCashback = this.roundMoney(invoicedAmountUsd * (percent / 100));
        if (estimatedCashback <= 0) continue;

        const referredBriefs = await this.svService.getClinicHistoryBriefs([referredPatientId]);
        const referred = referredBriefs.get(referredPatientId);
        const treatmentLabel = this.sourceLabelFromMetadata({
          sourceType: ctx.sourceType,
          cashbackPhase: ctx.cashbackPhase,
        });

        phaseItems.push({
          referredPatientId,
          referredPatientName: referred?.fullName ?? refOpp.name ?? null,
          referredClinicHistory: referred?.history ?? refOpp.cClinicHistory ?? null,
          referredOpportunityId: refOpp.id,
          treatmentLabel,
          invoicedAmount: invoicedAmountUsd,
          estimatedCashback,
          currency: CASHBACK_ACCOUNT_CURRENCY,
          exchangeRate: ctx.exchangeRate ?? null,
          status: 'waiting_referrer_eligibility',
          phases: [
            {
              treatmentLabel,
              sourceType: ctx.sourceType,
              cashbackPhase: ctx.cashbackPhase,
              invoicedAmount: invoicedAmountUsd,
              estimatedCashback,
              currency: CASHBACK_ACCOUNT_CURRENCY,
              exchangeRate: ctx.exchangeRate ?? null,
            },
          ],
        });
      }

      if (!phaseItems.length) continue;

      if (phaseItems.length === 1) {
        pending.push(phaseItems[0]);
        continue;
      }

      // Varias fases (ej. moldes+inicial $100 + cierre contado $260) → un pending agregado
      const totalInvoiced = this.roundMoney(
        phaseItems.reduce((s, p) => s + p.invoicedAmount, 0),
      );
      const totalCashback = this.roundMoney(
        phaseItems.reduce((s, p) => s + p.estimatedCashback, 0),
      );
      const phases = phaseItems.flatMap((p) => p.phases ?? []);
      pending.push({
        referredPatientId: phaseItems[0].referredPatientId,
        referredPatientName: phaseItems[0].referredPatientName,
        referredClinicHistory: phaseItems[0].referredClinicHistory,
        referredOpportunityId: phaseItems[0].referredOpportunityId,
        treatmentLabel: phases.map((p) => p.treatmentLabel).join(' + '),
        invoicedAmount: totalInvoiced,
        estimatedCashback: totalCashback,
        currency: CASHBACK_ACCOUNT_CURRENCY,
        status: 'waiting_referrer_eligibility',
        phases,
      });
    }

    return pending;
  }

  /**
   * Referidos con contrato OFM contado incompleto: estimado al cerrar (10% del saldo pendiente).
   */
  private async buildProspectiveReferralCashback(
    referrerPatientId: number,
    percent: number,
  ): Promise<PendingReferralCashbackItem[]> {
    const refOpps = await this.listReferralOpportunitiesForTitular(referrerPatientId);
    const prospective: PendingReferralCashbackItem[] = [];

    for (const refOpp of refOpps) {
      const referredPatientId = await this.svService.getPatientIdByOpportunityEspoId(refOpp.id);
      if (!referredPatientId) continue;

      const triggerIrbIds = await this.svService.listOfmCashbackTriggerIrbIdsForPatient(
        referredPatientId,
      );
      if (triggerIrbIds.length) continue;

      const progress = await this.svService.getReferrerOfmEligibilityProgress(referredPatientId);
      if (!progress.hasOfmContract || progress.treatmentCode !== 'OFM_CONTADO') continue;
      if (progress.amountPending <= 0.01) continue;
      if (progress.amountPaid <= 0 && !progress.hasValidInvoice) continue;

      const estimatedCashback = this.roundMoney(progress.amountPending * (percent / 100));
      if (estimatedCashback <= 0) continue;

      const referredBriefs = await this.svService.getClinicHistoryBriefs([referredPatientId]);
      const referred = referredBriefs.get(referredPatientId);

      prospective.push({
        referredPatientId,
        referredPatientName: referred?.fullName ?? refOpp.name ?? null,
        referredClinicHistory: referred?.history ?? refOpp.cClinicHistory ?? null,
        referredOpportunityId: refOpp.id,
        treatmentLabel: progress.treatmentLabel,
        invoicedAmount: progress.amountPending,
        estimatedCashback,
        currency: progress.currency,
        status: 'waiting_referral_contract',
        contractTotal: progress.contractTotal,
        amountPaid: progress.amountPaid,
        amountPending: progress.amountPending,
        progressPercent: progress.progressPercent,
      });
    }

    return prospective;
  }

  private sourceLabelFromMetadata(metadata: Record<string, unknown>): string {
    const sourceType = String(metadata.sourceType ?? '');
    const phase = String(metadata.cashbackPhase ?? '');
    if (sourceType === 'OFM_CONTADO_COMPLETE' || phase === 'contado_complete') {
      return 'OFM contado — tratamiento completo';
    }
    if (sourceType === 'OFM_CUOTAS_INICIAL' || phase === 'cuotas_inicial') {
      return 'OFM cuotas — moldes + inicial';
    }
    if (sourceType === 'OFM_CUOTAS_REMAINDER' || phase === 'cuotas_remainder') {
      return 'OFM cuotas — cierre';
    }
    if (sourceType === 'OI_FULL_PLAN') return 'OI plan completo';
    if (sourceType === 'OI_STANDALONE_TARIFF') return 'OI tratamiento';
    return 'Referido';
  }

  private buildReferredSummary(
    entries: Array<{
      entryType: string;
      amount: number;
      currency: string;
      displayAmountUsd?: number;
      exchangeRate?: number | null;
      originalCurrency?: string | null;
      originalAmount?: number | null;
      referredPatientId?: number | null;
      referredPatientName?: string | null;
      referredClinicHistory?: string | null;
      sourceLabel?: string;
      treatmentLabel?: string | null;
      invoicedAmount?: number | null;
      invoicedAmountUsd?: number | null;
      invoicedAt?: string | Date | null;
      creditedAt?: string | Date | null;
      createdAt: string | Date;
    }>,
  ) {
    const byPatient = new Map<
      number,
      {
        referredPatientId: number;
        referredPatientName: string | null;
        referredClinicHistory: string | null;
        totalEarnedUsd: number;
        totalEarnedPen: number;
        payments: Array<{
          date: string;
          sourceLabel: string;
          treatmentLabel: string | null;
          invoicedAmount: number | null;
          cashbackAmount: number;
          currency: string;
        }>;
      }
    >();

    for (const entry of entries) {
      if (entry.entryType !== 'EARNED' || !entry.referredPatientId) continue;

      let row = byPatient.get(entry.referredPatientId);
      if (!row) {
        row = {
          referredPatientId: entry.referredPatientId,
          referredPatientName: entry.referredPatientName ?? null,
          referredClinicHistory: entry.referredClinicHistory ?? null,
          totalEarnedUsd: 0,
          totalEarnedPen: 0,
          payments: [],
        };
        byPatient.set(entry.referredPatientId, row);
      }

      const amountUsd = entry.displayAmountUsd ?? (
        entry.currency === ReferralCashbackCurrency.USD
          ? entry.amount
          : convertCashbackAmountToUsd(
              entry.amount,
              ReferralCashbackCurrency.PEN,
              entry.exchangeRate,
            ) ?? 0
      );
      row.totalEarnedUsd = this.roundMoney(row.totalEarnedUsd + amountUsd);

      const dateIso =
        entry.creditedAt instanceof Date
          ? entry.creditedAt.toISOString()
          : entry.createdAt instanceof Date
            ? entry.createdAt.toISOString()
            : String(entry.creditedAt ?? entry.createdAt);

      row.payments.push({
        date: dateIso,
        sourceLabel: entry.sourceLabel ?? 'Referido',
        treatmentLabel: entry.treatmentLabel ?? null,
        invoicedAmount: entry.invoicedAmountUsd ?? entry.invoicedAmount ?? null,
        cashbackAmount: entry.displayAmountUsd ?? entry.amount,
        currency: CASHBACK_ACCOUNT_CURRENCY,
      });
    }

    return [...byPatient.values()].sort((a, b) => {
      const aTotal = a.totalEarnedUsd + a.totalEarnedPen;
      const bTotal = b.totalEarnedUsd + b.totalEarnedPen;
      return bTotal - aTotal;
    });
  }

  /**
   * Resuelve referido → referidor directo (c_primary_opportunity_id).
   * Puede ser una opp REF elegible (cadena Megumi → amigo).
   */
  async resolveReferrerOpportunity(referredOpportunity: Opportunity): Promise<Opportunity | null> {
    if (referredOpportunity.cPrimaryOpportunityId) {
      const primary = await this.opportunityRepo.findOne({
        where: { id: referredOpportunity.cPrimaryOpportunityId, deleted: false },
      });
      if (primary) return primary;
    }

    if (!referredOpportunity.contactId) return null;

    const siblings = await this.opportunityRepo.find({
      where: {
        contactId: referredOpportunity.contactId,
        deleted: false,
      },
      order: { createdAt: 'ASC' },
    });

    return (
      siblings.find((o) => o.cIsReferralCreation !== true && o.id !== referredOpportunity.id)
      ?? siblings.find((o) => o.cIsReferralCreation !== true)
      ?? null
    );
  }

  /**
   * Resuelve patient_id del referidor: clinic_history_crm por espo_id y, si falta
   * (común en titulares con pago previo a vincular HC), por c_clinic_history de la opp.
   */
  private async resolveReferrerPatientId(referrerOpportunity: Opportunity): Promise<number | null> {
    const byEspo = await this.svService.getPatientIdByOpportunityEspoId(referrerOpportunity.id);
    if (byEspo) return byEspo;

    const hc = referrerOpportunity.cClinicHistory?.trim();
    if (!hc) return null;

    const byHc = await this.svService.getPatientIdByClinicHistory(hc);
    if (byHc) {
      this.logger.warn(
        `resolveReferrerPatientId(${referrerOpportunity.id}): clinic_history_crm sin patient_id; ` +
          `resuelto por HC ${hc} → patient ${byHc}`,
      );
    }
    return byHc;
  }

  async findReferredOpportunityByPatientId(patientId: number): Promise<Opportunity | null> {
    const opportunities = await this.opportunityRepo.find({
      where: { cIsReferralCreation: true, deleted: false },
      order: { createdAt: 'DESC' },
    });

    for (const opp of opportunities) {
      const pid = await this.svService.getPatientIdByOpportunityEspoId(opp.id);
      if (pid === patientId) return opp;
    }
    return null;
  }

  async processInvoicePayment(dto: ProcessInvoiceCashbackDto): Promise<ReferralCashbackProcessResult> {
    const invoiceCtx = await this.svService.getInvoiceCashbackContext(dto.sourceIrbId);
    if (!invoiceCtx) {
      return { status: 'skipped', reason: 'Factura no encontrada o no válida en SV' };
    }
    if (!invoiceCtx.isEligible) {
      return {
        status: 'skipped',
        reason: invoiceCtx.skipReason ?? this.skipReasonForSourceType(invoiceCtx.sourceType),
      };
    }

    const isOfmSource =
      invoiceCtx.sourceType === 'OFM_CONTADO_COMPLETE'
      || invoiceCtx.sourceType === 'OFM_CUOTAS_INICIAL'
      || invoiceCtx.sourceType === 'OFM_CUOTAS_REMAINDER';

    if (isOfmSource || invoiceCtx.sourceType === 'OI_STANDALONE_TARIFF') {
      if (isOfmSource && !invoiceCtx.contractId) {
        return {
          status: 'skipped',
          reason: 'Pago no ligado a contrato OFM',
        };
      }
      const existingByIrb = await this.findEarnedEntryBySourceIrb(dto.sourceIrbId);
      if (
        existingByIrb
        && invoiceCtx.cashbackPhase !== 'cuotas_inicial'
      ) {
        return {
          status: 'duplicate',
          reason: 'IRB ya procesado',
          ledgerId: existingByIrb.id,
        };
      }
      if (isOfmSource && invoiceCtx.cashbackPhase && invoiceCtx.contractId) {
        const existingPhase = await this.findEarnedEntryByContractPhase(
          invoiceCtx.contractId,
          invoiceCtx.cashbackPhase,
        );
        if (existingPhase && invoiceCtx.cashbackPhase !== 'cuotas_inicial') {
          return {
            status: 'duplicate',
            reason: `Cashback ya acreditado (${invoiceCtx.cashbackPhase})`,
            ledgerId: existingPhase.id,
          };
        }
      }

      // Evitar doble: si ya se acreditó moldes+inicial y el head de cierre incluye
      // esas líneas (misma boleta), restar esa base. Si el head es solo "Único pago"
      // restante ($2600), NO restar.
      if (
        invoiceCtx.sourceType === 'OFM_CONTADO_COMPLETE'
        && invoiceCtx.contractId
        && invoiceCtx.cashbackPhase === 'contado_complete'
        && invoiceCtx.closingIncludesPrimerPago
      ) {
        const priorInicial = await this.findEarnedEntryByContractPhase(
          invoiceCtx.contractId,
          'cuotas_inicial',
        );
        if (priorInicial?.metadata) {
          const priorMeta = priorInicial.metadata as Record<string, unknown>;
          const priorBaseUsd = Number(priorMeta.invoicedAmountUsd ?? priorMeta.invoicedAmount ?? 0);
          const currentUsd =
            invoiceCtx.invoicedAmountUsd
            ?? convertCashbackAmountToUsd(
              invoiceCtx.invoicedAmount,
              invoiceCtx.currency,
              invoiceCtx.exchangeRate,
            );
          if (priorBaseUsd > 0 && currentUsd != null && currentUsd > priorBaseUsd) {
            invoiceCtx.invoicedAmountUsd = this.roundMoney(currentUsd - priorBaseUsd);
            if (invoiceCtx.currency === ReferralCashbackCurrency.PEN && invoiceCtx.exchangeRate) {
              invoiceCtx.invoicedAmount = this.roundMoney(
                invoiceCtx.invoicedAmountUsd * invoiceCtx.exchangeRate,
              );
            } else {
              invoiceCtx.invoicedAmount = invoiceCtx.invoicedAmountUsd;
            }
          }
        }
      }
    } else if (invoiceCtx.sourceType === 'OI_FULL_PLAN' && invoiceCtx.treatmentPlanId) {
      const existingPlan = await this.findEarnedEntryByTreatmentPlan(invoiceCtx.treatmentPlanId);
      if (existingPlan) {
        return {
          status: 'duplicate',
          reason: 'Plan OI ya generó cashback',
          ledgerId: existingPlan.id,
        };
      }
    }

    if (invoiceCtx.invoicedAmount <= 0) {
      return { status: 'skipped', reason: 'Monto facturado inválido' };
    }

    let referredOpportunity: Opportunity | null = null;
    if (dto.referredOpportunityId) {
      referredOpportunity = await this.opportunityRepo.findOne({
        where: { id: dto.referredOpportunityId, deleted: false },
      });
    }
    if (!referredOpportunity) {
      referredOpportunity = await this.findReferredOpportunityByPatientId(invoiceCtx.patientId);
    }
    if (!referredOpportunity?.cIsReferralCreation) {
      return { status: 'skipped', reason: 'Paciente no es referido en CRM (REF-N)' };
    }

    const referrerOpportunity = await this.resolveReferrerOpportunity(referredOpportunity);
    if (!referrerOpportunity) {
      return { status: 'skipped', reason: 'No se encontró oportunidad referidor' };
    }

    const referrerPatientId = await this.resolveReferrerPatientId(referrerOpportunity);
    if (!referrerPatientId) {
      return { status: 'skipped', reason: 'Referidor sin patient_id en SV' };
    }

    const referrerEligible = await this.svService.isPatientReferrerEligible(referrerPatientId);
    if (!referrerEligible) {
      return {
        status: 'skipped',
        reason: 'Referidor no habilitado (OFM contado/cuotas al 100% o moldes+inicial en cuotas)',
      };
    }

    const config = await this.getConfig();
    if (!config.active) {
      return { status: 'skipped', reason: 'Cashback referidos desactivado' };
    }

    const percent = Number(config.defaultPercent);
    const invoicedBaseUsd =
      invoiceCtx.invoicedAmountUsd
      ?? (invoiceCtx.currency === ReferralCashbackCurrency.USD
        ? invoiceCtx.invoicedAmount
        : convertCashbackAmountToUsd(
            invoiceCtx.invoicedAmount,
            invoiceCtx.currency,
            invoiceCtx.exchangeRate,
          ));

    if (invoicedBaseUsd == null || invoicedBaseUsd <= 0) {
      return {
        status: 'skipped',
        reason:
          invoiceCtx.currency === ReferralCashbackCurrency.PEN
            ? 'Factura en soles sin tipo de cambio válido'
            : 'Monto facturado inválido',
      };
    }

    const cashbackAmountUsd = this.roundMoney(invoicedBaseUsd * (percent / 100));
    const originalCashbackAmount =
      invoiceCtx.currency === ReferralCashbackCurrency.PEN
        ? this.roundMoney(invoiceCtx.invoicedAmount * (percent / 100))
        : cashbackAmountUsd;

    if (cashbackAmountUsd <= 0) {
      return { status: 'skipped', reason: 'Cashback calculado es cero' };
    }

    const expirationMonths = await this.getExpirationMonths();
    const creditedAt = new Date();
    const expiresAt = this.addMonths(creditedAt, expirationMonths);

    if (invoiceCtx.cashbackPhase === 'cuotas_inicial' && invoiceCtx.contractId) {
      const phaseEntries = await this.findEarnedEntriesByContractPhase(
        invoiceCtx.contractId,
        'cuotas_inicial',
      );
      if (phaseEntries.length > 0) {
        const topUp = await this.creditPrimerPagoTopUpIfNeeded({
          phaseEntries,
          invoiceCtx,
          dto,
          invoicedBaseUsd,
          expectedCashbackUsd: cashbackAmountUsd,
          percent,
          referrerPatientId,
          referrerOpportunity,
          referredOpportunity,
          expirationMonths,
          expiresAt,
        });
        if (topUp) return topUp;
        return {
          status: 'duplicate',
          reason: 'Cashback ya acreditado (cuotas_inicial)',
          ledgerId: phaseEntries[0].id,
        };
      }
    }

    let balance = await this.balanceRepo.findOne({
      where: {
        patientId: referrerPatientId,
        currency: CASHBACK_ACCOUNT_CURRENCY,
      },
    });

    if (!balance) {
      balance = this.balanceRepo.create({
        patientId: referrerPatientId,
        currency: CASHBACK_ACCOUNT_CURRENCY,
        availableAmount: 0,
        totalEarned: 0,
        totalUsed: 0,
        referrerOpportunityId: referrerOpportunity.id,
      });
    }

    balance.referrerOpportunityId = referrerOpportunity.id;
    if (!balance.id) {
      balance = await this.balanceRepo.save(balance);
    }

    let ledger;
    try {
      ledger = await this.ledgerRepo.save(
        this.ledgerRepo.create({
          balanceId: balance.id,
          entryType: ReferralCashbackLedgerType.EARNED,
          amount: cashbackAmountUsd,
          currency: CASHBACK_ACCOUNT_CURRENCY,
          percentApplied: percent,
          referrerPatientId,
          referredPatientId: invoiceCtx.patientId,
          referrerOpportunityId: referrerOpportunity.id,
          referredOpportunityId: referredOpportunity.id,
          sourceIrbId: dto.sourceIrbId,
          sourceContractId: invoiceCtx.contractId,
          expiresAt,
          metadata: {
            invoicedAmount: invoiceCtx.invoicedAmount,
            invoicedAmountUsd: invoicedBaseUsd,
            originalCurrency: invoiceCtx.currency,
            originalAmount: originalCashbackAmount,
            exchangeRate: invoiceCtx.exchangeRate ?? null,
            sourceType: invoiceCtx.sourceType,
            cashbackPhase: invoiceCtx.cashbackPhase ?? null,
            treatmentCode: invoiceCtx.treatmentCode,
            treatmentPlanId: invoiceCtx.treatmentPlanId,
            tariffId: invoiceCtx.tariffId,
            invoiceHeadId: invoiceCtx.invoiceHeadId,
            remainingAmount: cashbackAmountUsd,
            expirationMonths,
            referralRootOpportunityId: referredOpportunity.cReferralRootOpportunityId ?? null,
          },
        }),
      );
    } catch (error: unknown) {
      const pgCode =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      const driverCode =
        error && typeof error === 'object' && 'driverError' in error
          ? (error as { driverError?: { code?: string } }).driverError?.code
          : undefined;
      if (pgCode === '23505' || driverCode === '23505') {
        const existing = await this.findEarnedEntryBySourceIrb(dto.sourceIrbId);
        return {
          status: 'duplicate',
          reason: 'IRB ya procesado (concurrencia)',
          ledgerId: existing?.id,
        };
      }
      throw error;
    }

    balance.availableAmount = this.roundMoney(Number(balance.availableAmount) + cashbackAmountUsd);
    balance.totalEarned = this.roundMoney(Number(balance.totalEarned) + cashbackAmountUsd);
    balance = await this.balanceRepo.save(balance);

    this.logger.log(
      `Cashback +${cashbackAmountUsd} USD → patient ${referrerPatientId} ` +
        `(IRB ${dto.sourceIrbId}, referido ${invoiceCtx.patientId}` +
        `${invoiceCtx.currency === ReferralCashbackCurrency.PEN ? `, TC ${invoiceCtx.exchangeRate}` : ''})`,
    );

    return {
      status: 'credited',
      cashbackAmount: cashbackAmountUsd,
      currency: CASHBACK_ACCOUNT_CURRENCY,
      referrerPatientId,
      ledgerId: ledger.id,
    };
  }

  async applyCashback(dto: ApplyReferralCashbackDto) {
    const currency = dto.currency as ReferralCashbackCurrency;
    await this.expireStaleCreditsForPatient(dto.patientId);

    const balance = await this.balanceRepo.findOne({
      where: { patientId: dto.patientId, currency },
    });

    if (!balance || Number(balance.availableAmount) < dto.amount) {
      throw new BadRequestException('Saldo de cashback insuficiente');
    }

    await this.reconcileEarnedRemainingWithBalance(balance);
    const consumedLots = await this.consumeEarnedFifo(balance.id, dto.amount);

    balance.availableAmount = this.roundMoney(Number(balance.availableAmount) - dto.amount);
    balance.totalUsed = this.roundMoney(Number(balance.totalUsed) + dto.amount);
    await this.balanceRepo.save(balance);

    const ledger = await this.ledgerRepo.save(
      this.ledgerRepo.create({
        balanceId: balance.id,
        entryType: ReferralCashbackLedgerType.USED,
        amount: dto.amount,
        currency,
        referrerPatientId: dto.patientId,
        applyContext: dto.applyContext ?? null,
        metadata: {
          ...(dto.metadata ?? {}),
          consumedLots,
        },
      }),
    );

    return {
      status: 'applied',
      patientId: dto.patientId,
      amount: dto.amount,
      currency,
      remainingBalance: Number(balance.availableAmount),
      ledgerId: ledger.id,
    };
  }

  /** Expira créditos vencidos de todos los pacientes (cron diario). */
  async expireAllStaleCredits(): Promise<{ expiredEntries: number; totalAmount: number }> {
    const balances = await this.balanceRepo.find();
    let expiredEntries = 0;
    let totalAmount = 0;

    for (const balance of balances) {
      const result = await this.expireStaleCreditsForBalance(balance);
      expiredEntries += result.expiredEntries;
      totalAmount = this.roundMoney(totalAmount + result.totalAmount);
    }

    if (expiredEntries > 0) {
      this.logger.log(
        `Cashback expirado: ${expiredEntries} lote(s), total ${totalAmount}`,
      );
    }

    return { expiredEntries, totalAmount };
  }

  async checkReferrerEligibility(patientId: number) {
    const eligible = await this.svService.isPatientReferrerEligible(patientId);
    return { patientId, eligible };
  }

  /**
   * Procesa IRB pendientes del paciente (OFM contado/cuotas + OI plan completo en una factura).
   * Llamar tras facturar en cerradoras/OI (referido B) o vía hook SV.
   * Si el paciente es titular habilitado, reprocesa también sus referidos (cierre pendiente de acreditar).
   */
  async processPendingForPatient(
    patientId: number,
    referredOpportunityId?: string,
    options?: { skipTitularCascade?: boolean },
  ): Promise<ProcessPendingForPatientResult> {
    const [ofmIrbIds, oiPlanIrbIds, oiStandaloneIrbIds] = await Promise.all([
      this.svService.listOfmCashbackTriggerIrbIdsForPatient(patientId),
      this.svService.listOiFullPlanAnchorIrbIdsForPatient(patientId),
      this.svService.listOiStandaloneTariffIrbIdsForPatient(patientId),
    ]);
    const irbIds = [...new Set([...ofmIrbIds, ...oiPlanIrbIds, ...oiStandaloneIrbIds])].sort(
      (a, b) => a - b,
    );
    const results: ReferralCashbackProcessResult[] = [];

    for (const sourceIrbId of irbIds) {
      try {
        const result = await this.processInvoicePayment({
          sourceIrbId,
          referredOpportunityId,
        });
        if (
          result.status === 'credited'
          || result.status === 'duplicate'
          || result.status === 'skipped'
        ) {
          results.push(result);
        }
        if (result.status === 'skipped') {
          this.logger.warn(
            `processPendingForPatient(${patientId}) IRB ${sourceIrbId} omitido: ${result.reason ?? 'sin motivo'}`,
          );
        } else if (result.status === 'error') {
          this.logger.error(
            `processPendingForPatient(${patientId}) IRB ${sourceIrbId} falló: ${result.reason ?? result.status}`,
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `processPendingForPatient(${patientId}) IRB ${sourceIrbId} excepción: ${message}`,
        );
        results.push({ status: 'error', reason: message });
      }
    }

    let titularReferrals: ProcessPendingForPatientResult[] | undefined;
    if (!options?.skipTitularCascade) {
      titularReferrals = await this.reprocessTitularReferrals(patientId);
    }

    const allResults = [
      ...results,
      ...(titularReferrals?.flatMap((r) => r.results) ?? []),
    ];
    const credited = allResults.filter((r) => r.status === 'credited');
    return {
      patientId,
      processed: irbIds.length + (titularReferrals?.reduce((s, r) => s + r.processed, 0) ?? 0),
      credited: credited.length,
      totalCashback: credited.reduce((s, r) => s + (r.cashbackAmount ?? 0), 0),
      results: allResults,
      titularReferrals,
    };
  }

  /** Throttle del auto-saneo por titular (evita reprocesar en cada carga del dashboard). */
  private readonly selfHealLastRunAt = new Map<number, number>();
  private static readonly SELF_HEAL_COOLDOWN_MS = 5 * 60 * 1000;

  /**
   * Titular habilitado con cashback de referidos sin acreditar (p. ej. el hook post-factura
   * falló o corrió con código desactualizado): dispara la acreditación en background.
   * Fire-and-forget con cooldown; la deduplicación por source_irb_id evita dobles abonos.
   */
  private triggerSelfHealCredit(titularPatientId: number): void {
    const now = Date.now();
    const lastRun = this.selfHealLastRunAt.get(titularPatientId) ?? 0;
    if (now - lastRun < ReferralCashbackService.SELF_HEAL_COOLDOWN_MS) return;
    this.selfHealLastRunAt.set(titularPatientId, now);

    void this.reprocessTitularReferrals(titularPatientId)
      .then((outcomes) => {
        const credited = outcomes.reduce((s, o) => s + o.credited, 0);
        if (credited > 0) {
          this.logger.log(
            `selfHealCredit(${titularPatientId}): ${credited} cashback(s) de referidos acreditados en background`,
          );
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`selfHealCredit(${titularPatientId}) falló: ${message}`);
      });
  }

  /**
   * Si el paciente es titular habilitado, reprocesa IRB de sus REF-N que quedaron en skip
   * (típico: referido facturó antes de que el titular cerrara su OFM).
   */
  private async reprocessTitularReferrals(
    titularPatientId: number,
  ): Promise<ProcessPendingForPatientResult[]> {
    const eligible = await this.svService.isPatientReferrerEligible(titularPatientId);
    if (!eligible) return [];

    const refOpps = await this.listReferralOpportunitiesForTitular(titularPatientId);
    if (!refOpps.length) return [];

    const outcomes: ProcessPendingForPatientResult[] = [];
    for (const refOpp of refOpps) {
      const referredPatientId = await this.svService.getPatientIdByOpportunityEspoId(refOpp.id);
      if (!referredPatientId) continue;

      const outcome = await this.processPendingForPatient(referredPatientId, refOpp.id, {
        skipTitularCascade: true,
      });
      if (outcome.credited > 0) {
        this.logger.log(
          `reprocessTitularReferrals(${titularPatientId}) referido ${referredPatientId}: ${outcome.credited} acreditado(s), total ${outcome.totalCashback}`,
        );
      } else {
        const skipped = outcome.results.filter((r) => r.status === 'skipped');
        if (skipped.length > 0) {
          this.logger.warn(
            `reprocessTitularReferrals(${titularPatientId}) referido ${referredPatientId} sin acreditar: ` +
              skipped.map((r) => r.reason ?? r.status).join('; '),
          );
        }
      }
      outcomes.push(outcome);
    }
    return outcomes;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async getExpirationMonths(): Promise<number> {
    const config = await this.getConfig();
    const months = Number(config.expirationMonths ?? 3);
    return Number.isFinite(months) && months > 0 ? months : 3;
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  private getRemainingAmount(ledger: ReferralCashbackLedger): number {
    const meta = (ledger.metadata ?? {}) as Record<string, unknown>;
    if (meta.remainingAmount != null) {
      return Math.max(0, Number(meta.remainingAmount));
    }
    return Math.max(0, Number(ledger.amount));
  }

  private async expireStaleCreditsForPatient(patientId: number): Promise<void> {
    const balances = await this.balanceRepo.find({ where: { patientId } });
    for (const balance of balances) {
      await this.expireStaleCreditsForBalance(balance);
    }
  }

  private async expireStaleCreditsForBalance(
    balance: ReferralCashbackBalance,
  ): Promise<{ expiredEntries: number; totalAmount: number }> {
    await this.reconcileEarnedRemainingWithBalance(balance);
    const now = new Date();
    const earnedLots = await this.ledgerRepo.find({
      where: {
        balanceId: balance.id,
        entryType: ReferralCashbackLedgerType.EARNED,
      },
      order: { createdAt: 'ASC' },
    });

    let expiredEntries = 0;
    let totalAmount = 0;

    for (const lot of earnedLots) {
      const expiresAt =
        lot.expiresAt ??
        this.addMonths(lot.createdAt, await this.getExpirationMonths());
      if (expiresAt > now) continue;

      const remaining = this.getRemainingAmount(lot);
      if (remaining <= 0) continue;

      await this.ledgerRepo.save(
        this.ledgerRepo.create({
          balanceId: balance.id,
          entryType: ReferralCashbackLedgerType.EXPIRED,
          amount: remaining,
          currency: lot.currency,
          referrerPatientId: balance.patientId,
          metadata: {
            earnedLedgerId: lot.id,
            expiredAt: now.toISOString(),
            originalExpiresAt: expiresAt.toISOString(),
          },
        }),
      );

      lot.metadata = {
        ...(lot.metadata ?? {}),
        remainingAmount: 0,
        expiredAt: now.toISOString(),
      };
      if (!lot.expiresAt) lot.expiresAt = expiresAt;
      await this.ledgerRepo.save(lot);

      totalAmount = this.roundMoney(totalAmount + remaining);
      expiredEntries += 1;
    }

    if (totalAmount > 0) {
      balance.availableAmount = this.roundMoney(
        Math.max(0, Number(balance.availableAmount) - totalAmount),
      );
      await this.balanceRepo.save(balance);
    }

    return { expiredEntries, totalAmount };
  }

  private async reconcileEarnedRemainingWithBalance(
    balance: ReferralCashbackBalance,
  ): Promise<void> {
    const expirationMonths = await this.getExpirationMonths();
    const earnedLots = await this.ledgerRepo.find({
      where: {
        balanceId: balance.id,
        entryType: ReferralCashbackLedgerType.EARNED,
      },
      order: { createdAt: 'ASC' },
    });

    for (const lot of earnedLots) {
      const meta = (lot.metadata ?? {}) as Record<string, unknown>;
      let changed = false;

      if (meta.remainingAmount == null) {
        meta.remainingAmount = Number(lot.amount);
        changed = true;
      }
      if (!lot.expiresAt) {
        lot.expiresAt = this.addMonths(lot.createdAt, expirationMonths);
        changed = true;
      }
      if (changed) {
        lot.metadata = meta;
        await this.ledgerRepo.save(lot);
      }
    }

    const totalRemaining = earnedLots.reduce(
      (sum, lot) => sum + this.getRemainingAmount(lot),
      0,
    );
    const available = Number(balance.availableAmount);

    if (totalRemaining > available + 0.01) {
      let excess = this.roundMoney(totalRemaining - available);
      for (const lot of earnedLots) {
        if (excess <= 0) break;
        const rem = this.getRemainingAmount(lot);
        const cut = Math.min(rem, excess);
        lot.metadata = {
          ...(lot.metadata ?? {}),
          remainingAmount: this.roundMoney(rem - cut),
        };
        await this.ledgerRepo.save(lot);
        excess = this.roundMoney(excess - cut);
      }
    }
  }

  private async consumeEarnedFifo(
    balanceId: number,
    amount: number,
  ): Promise<Array<{ earnedLedgerId: number; amount: number }>> {
    const now = new Date();
    const earnedLots = await this.ledgerRepo.find({
      where: {
        balanceId,
        entryType: ReferralCashbackLedgerType.EARNED,
      },
      order: { createdAt: 'ASC' },
    });

    let left = amount;
    const consumed: Array<{ earnedLedgerId: number; amount: number }> = [];

    for (const lot of earnedLots) {
      if (left <= 0.001) break;

      const expiresAt = lot.expiresAt;
      if (expiresAt && expiresAt <= now) continue;

      const remaining = this.getRemainingAmount(lot);
      if (remaining <= 0) continue;

      const take = Math.min(remaining, left);
      consumed.push({ earnedLedgerId: lot.id, amount: this.roundMoney(take) });

      lot.metadata = {
        ...(lot.metadata ?? {}),
        remainingAmount: this.roundMoney(remaining - take),
      };
      await this.ledgerRepo.save(lot);
      left = this.roundMoney(left - take);
    }

    if (left > 0.001) {
      throw new BadRequestException(
        'Saldo de cashback insuficiente (créditos vencidos o agotados)',
      );
    }

    return consumed;
  }

  private async getNextExpirationAtForPatient(
    patientId: number,
  ): Promise<string | null> {
    const balances = await this.balanceRepo.find({ where: { patientId } });
    if (balances.length === 0) return null;

    const balanceIds = balances.map((b) => b.id);
    const now = new Date();
    const lots = await this.ledgerRepo
      .createQueryBuilder('l')
      .where('l.balance_id IN (:...balanceIds)', { balanceIds })
      .andWhere('l.entry_type = :entryType', {
        entryType: ReferralCashbackLedgerType.EARNED,
      })
      .andWhere('l.expires_at IS NOT NULL')
      .andWhere('l.expires_at > :now', { now })
      .orderBy('l.expires_at', 'ASC')
      .getMany();

    for (const lot of lots) {
      if (this.getRemainingAmount(lot) > 0 && lot.expiresAt) {
        return lot.expiresAt.toISOString();
      }
    }
    return null;
  }

  private skipReasonForSourceType(sourceType: ReferralCashbackSvSourceType): string {
    switch (sourceType) {
      case 'OFM_CONTADO_COMPLETE':
        return 'Contrato OFM al contado aún no está pagado al 100%';
      case 'OFM_CUOTAS_INICIAL':
        return 'Primer pago OFM en cuotas (Moldes + Inicial) no elegible';
      case 'OFM_CUOTAS_REMAINDER':
        return 'Cuotas del contrato OFM aún no están pagadas al 100%';
      case 'OI_FULL_PLAN':
        return 'Pago OI no califica (requiere plan completo en una sola factura)';
      case 'OI_STANDALONE_TARIFF':
        return 'Pago OI suelto no califica (requiere tarifa OI pagada completa, sin evaluación)';
      default:
        return 'Factura no elegible para cashback referidos';
    }
  }

  private async findEarnedEntriesByContractPhase(contractId: number, phase: string) {
    return this.ledgerRepo
      .createQueryBuilder('l')
      .where('l.entry_type = :entryType', { entryType: ReferralCashbackLedgerType.EARNED })
      .andWhere('l.source_contract_id = :contractId', { contractId })
      .andWhere("l.metadata->>'cashbackPhase' = :phase", { phase })
      .orderBy('l.created_at', 'ASC')
      .getMany();
  }

  /**
   * Tras cambio cuotas→contado→cuotas, el primer tramo puede tener facturas PEN + USD.
   * Si ya se acreditó solo el bloque en soles, completa el delta hasta el 10% USD correcto.
   */
  private async creditPrimerPagoTopUpIfNeeded(params: {
    phaseEntries: ReferralCashbackLedger[];
    invoiceCtx: {
      contractId: number | null;
      patientId: number;
      sourceType: string;
      cashbackPhase?: string;
      treatmentCode?: string;
      exchangeRate?: number | null;
    };
    dto: ProcessInvoiceCashbackDto;
    invoicedBaseUsd: number;
    expectedCashbackUsd: number;
    percent: number;
    referrerPatientId: number;
    referrerOpportunity: Opportunity;
    referredOpportunity: Opportunity;
    expirationMonths: number;
    expiresAt: Date;
  }): Promise<ReferralCashbackProcessResult | null> {
    const {
      phaseEntries,
      invoiceCtx,
      dto,
      invoicedBaseUsd,
      expectedCashbackUsd,
      percent,
      referrerPatientId,
      referrerOpportunity,
      referredOpportunity,
      expirationMonths,
      expiresAt,
    } = params;

    const irbIds = phaseEntries
      .map((e) => e.sourceIrbId)
      .filter((id): id is number => id != null && Number.isFinite(id) && id > 0);
    const irbRates = await this.svService.getExchangeRatesForIrbs([
      ...irbIds,
      ...(dto.sourceIrbId ? [dto.sourceIrbId] : []),
    ]);

    const creditedUsd = this.roundMoney(
      phaseEntries.reduce((sum, entry) => {
        const meta = (entry.metadata ?? {}) as Record<string, unknown>;
        const storedRate =
          meta.exchangeRate != null && Number.isFinite(Number(meta.exchangeRate))
            ? Number(meta.exchangeRate)
            : null;
        const irbRate =
          entry.sourceIrbId != null ? irbRates.get(entry.sourceIrbId) ?? null : null;
        const rate = storedRate ?? irbRate;
        if (entry.currency === ReferralCashbackCurrency.USD) {
          return sum + Number(entry.amount);
        }
        const usd = convertCashbackAmountToUsd(
          Number(entry.amount),
          ReferralCashbackCurrency.PEN,
          rate,
        );
        return sum + (usd ?? 0);
      }, 0),
    );

    const deltaUsd = this.roundMoney(expectedCashbackUsd - creditedUsd);
    if (deltaUsd <= 0.01) return null;

    const ledgerSourceIrbId = await this.resolveTopUpLedgerSourceIrbId(
      invoiceCtx.patientId,
      dto.sourceIrbId,
    );

    let supplementalInvoicedUsd: number | null = null;
    if (ledgerSourceIrbId) {
      const irbDetails = await this.svService.getIrbCashbackDetails([ledgerSourceIrbId]);
      const irb = irbDetails.get(ledgerSourceIrbId);
      if (irb) {
        supplementalInvoicedUsd =
          irb.currency === ReferralCashbackCurrency.USD
            ? irb.amount
            : convertCashbackAmountToUsd(irb.amount, irb.currency, irb.exchangeRate);
      }
    }
    if (supplementalInvoicedUsd == null || supplementalInvoicedUsd <= 0) {
      supplementalInvoicedUsd = deltaUsd * (100 / percent);
    }

    let balance = await this.balanceRepo.findOne({
      where: {
        patientId: referrerPatientId,
        currency: CASHBACK_ACCOUNT_CURRENCY,
      },
    });
    if (!balance) {
      balance = this.balanceRepo.create({
        patientId: referrerPatientId,
        currency: CASHBACK_ACCOUNT_CURRENCY,
        availableAmount: 0,
        totalEarned: 0,
        totalUsed: 0,
        referrerOpportunityId: referrerOpportunity.id,
      });
      balance = await this.balanceRepo.save(balance);
    }

    const ledger = await this.ledgerRepo.save(
      this.ledgerRepo.create({
        balanceId: balance.id,
        entryType: ReferralCashbackLedgerType.EARNED,
        amount: deltaUsd,
        currency: CASHBACK_ACCOUNT_CURRENCY,
        percentApplied: percent,
        referrerPatientId,
        referredPatientId: invoiceCtx.patientId,
        referrerOpportunityId: referrerOpportunity.id,
        referredOpportunityId: referredOpportunity.id,
        sourceIrbId: ledgerSourceIrbId,
        sourceContractId: invoiceCtx.contractId,
        expiresAt,
        metadata: {
          primerPagoTopUp: true,
          triggerSourceIrbId: dto.sourceIrbId,
          supplementalInvoicedUsd: this.roundMoney(supplementalInvoicedUsd),
          primerTramoTotalUsd: invoicedBaseUsd,
          priorCreditedUsd: creditedUsd,
          sourceType: invoiceCtx.sourceType,
          cashbackPhase: invoiceCtx.cashbackPhase ?? 'cuotas_inicial',
          treatmentCode: invoiceCtx.treatmentCode,
          remainingAmount: deltaUsd,
          expirationMonths,
          referralRootOpportunityId: referredOpportunity.cReferralRootOpportunityId ?? null,
        },
      }),
    );

    balance.availableAmount = this.roundMoney(Number(balance.availableAmount) + deltaUsd);
    balance.totalEarned = this.roundMoney(Number(balance.totalEarned) + deltaUsd);
    await this.balanceRepo.save(balance);

    this.logger.log(
      `Cashback top-up +${deltaUsd} USD → patient ${referrerPatientId} ` +
        `(contrato ${invoiceCtx.contractId}, IRB ledger ${ledgerSourceIrbId ?? '—'}, base USD ${invoicedBaseUsd})`,
    );

    return {
      status: 'credited',
      cashbackAmount: deltaUsd,
      currency: CASHBACK_ACCOUNT_CURRENCY,
      referrerPatientId,
      ledgerId: ledger.id,
    };
  }

  /** IRB para ledger de top-up: uno del primer tramo que aún no tenga abono EARNED. */
  private async resolveTopUpLedgerSourceIrbId(
    referredPatientId: number,
    triggerSourceIrbId: number,
  ): Promise<number | null> {
    const triggerIrbIds = await this.svService.listOfmCashbackTriggerIrbIdsForPatient(
      referredPatientId,
    );
    const candidates = [
      ...new Set(
        [triggerSourceIrbId, ...triggerIrbIds].filter(
          (id) => Number.isFinite(id) && id > 0,
        ),
      ),
    ];
    for (const irbId of candidates) {
      const existing = await this.findEarnedEntryBySourceIrb(irbId);
      if (!existing) return irbId;
    }
    return null;
  }

  private async findEarnedEntryBySourceIrb(sourceIrbId: number) {
    return this.ledgerRepo.findOne({
      where: {
        sourceIrbId,
        entryType: ReferralCashbackLedgerType.EARNED,
      },
    });
  }

  private async findEarnedEntryByContractPhase(
    contractId: number,
    phase: string,
  ) {
    return this.ledgerRepo
      .createQueryBuilder('l')
      .where('l.entry_type = :entryType', { entryType: ReferralCashbackLedgerType.EARNED })
      .andWhere('l.source_contract_id = :contractId', { contractId })
      .andWhere("l.metadata->>'cashbackPhase' = :phase", { phase })
      .getOne();
  }

  private async findEarnedEntryByTreatmentPlan(treatmentPlanId: number) {
    return this.ledgerRepo
      .createQueryBuilder('l')
      .where('l.entry_type = :entryType', { entryType: ReferralCashbackLedgerType.EARNED })
      .andWhere("l.metadata->>'treatmentPlanId' = :planId", {
        planId: String(treatmentPlanId),
      })
      .getOne();
  }
}
