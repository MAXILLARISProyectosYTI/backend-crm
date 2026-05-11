import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OpportunityDerivationService } from './opportunity-derivation.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('opportunity-derivation')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class OpportunityDerivationController {
  constructor(private readonly service: OpportunityDerivationService) {}

  /**
   * Deriva una oportunidad OFM/APNEA al flujo OI.
   * Asigna automáticamente el siguiente ejecutivo OI en cola.
   */
  @Post(':opportunityId/derive-to-oi')
  async deriveToOi(
    @Param('opportunityId') opportunityId: string,
    @Req() req: any,
  ) {
    const userId: string = req.user?.userId ?? req.user?.id ?? '';
    return this.service.deriveToOi(opportunityId, userId);
  }

  /**
   * Retorna si la oportunidad tiene una derivación activa a OI y a qué ejecutivo fue asignada.
   */
  @Get(':opportunityId')
  async getDerivation(@Param('opportunityId') opportunityId: string) {
    return this.service.getDerivation(opportunityId);
  }

  /**
   * Lista de IDs de oportunidades derivadas asignadas a un ejecutivo OI.
   */
  @Get('by-user/:userId')
  async getDerivedForUser(@Param('userId') userId: string) {
    const opportunityIds = await this.service.getDerivedOpportunitiesForUser(userId);
    return { opportunityIds };
  }

  /**
   * Deriva a OI buscando la oportunidad OFM/APNEA por historia clínica (usado desde CRM Controles).
   */
  @Post('by-clinic-history/:hc/derive-to-oi')
  async deriveByClinicHistory(
    @Param('hc') hc: string,
    @Req() req: any,
  ) {
    const userId: string = req.user?.userId ?? req.user?.id ?? '';
    return this.service.deriveByClinicHistory(hc, userId);
  }

  /**
   * Verifica si existe una derivación activa para el paciente identificado por su HC.
   */
  @Get('by-clinic-history/:hc')
  async getDerivationByClinicHistory(@Param('hc') hc: string) {
    return this.service.getDerivationByClinicHistory(hc);
  }
}
