import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReferralCashbackService } from './referral-cashback.service';

/** Expira cashback no usado (default: diario 05:00 UTC = medianoche Lima). */
@Injectable()
export class ReferralCashbackExpirationCronService {
  private readonly logger = new Logger(ReferralCashbackExpirationCronService.name);

  constructor(private readonly referralCashbackService: ReferralCashbackService) {}

  @Cron(process.env.CRM_REFERRAL_CASHBACK_EXPIRE_CRON ?? '0 0 5 * * *')
  async handleExpireStaleCredits(): Promise<void> {
    try {
      await this.referralCashbackService.expireAllStaleCredits();
    } catch (err) {
      this.logger.error('Error al expirar cashback referidos', err);
    }
  }
}
