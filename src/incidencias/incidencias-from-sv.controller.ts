import {
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  Param,
  ParseIntPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { IncidenciasService } from './incidencias.service';

/** Bridge SV → CRM: texto completo de incidencias (crm_incidencias). */
@Controller('incidencias')
export class IncidenciasFromSvController {
  constructor(private readonly service: IncidenciasService) {}

  private assertInternalApiKey(apiKey: string | undefined) {
    const expected = [
      process.env.INTERNAL_API_KEY,
      process.env.INTERNAL_CRM_API_KEY,
    ].filter(Boolean);
    if (!expected.length) {
      throw new InternalServerErrorException(
        'INTERNAL_API_KEY no configurada en backend-crm',
      );
    }
    if (!apiKey || !expected.includes(apiKey)) {
      throw new UnauthorizedException('Clave interna inválida');
    }
  }

  @Public()
  @Get('mirror-from-sv/:pacienteId')
  async getMirrorForSv(
    @Headers('x-internal-api-key') apiKeyHeader: string,
    @Headers('authorization') authorization: string,
    @Param('pacienteId', ParseIntPipe) pacienteId: number,
  ) {
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    this.assertInternalApiKey(apiKeyHeader || bearer);
    return this.service.findLocalMirrorByPaciente(pacienteId);
  }

  /** Misma lista que GET /incidencias?pacienteId= (CRM Controles → HC). */
  @Public()
  @Get('for-hc-from-sv/:pacienteId')
  async getForHcFromSv(
    @Headers('x-internal-api-key') apiKeyHeader: string,
    @Headers('authorization') authorization: string,
    @Param('pacienteId', ParseIntPipe) pacienteId: number,
  ) {
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    this.assertInternalApiKey(apiKeyHeader || bearer);
    return this.service.findForPatient(pacienteId);
  }
}
