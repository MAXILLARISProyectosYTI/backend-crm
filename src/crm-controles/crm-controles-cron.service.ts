import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrmControlesService } from './crm-controles.service';

/**
 * Polling backend → SV. Expresión por env CRM_CONTROLES_CRON (default cada 3 min).
 * Formato: segundo minuto hora día mes día-semana (6 campos, @nestjs/schedule).
 */
@Injectable()
export class CrmControlesCronService {
  private readonly logger = new Logger(CrmControlesCronService.name);

  constructor(private readonly crmControlesService: CrmControlesService) {}

  @Cron(process.env.CRM_CONTROLES_CRON ?? '0 */3 * * * *')
  async handlePollSv(): Promise<void> {
    try {
      await this.crmControlesService.syncFromSv();
    } catch {
      // error ya logueado en service
    }
  }
}
