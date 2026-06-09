import {
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Public } from 'src/auth/decorators/public.decorator';
import { UserService } from '../user/user.service';
import { CrmCerradoresService } from './crm-cerradoras.service';
import { ListPacientesQueryDto } from './dto/list-pacientes-query.dto';

/**
 * Contratos de cerradoras (misma fuente que Mis Pacientes).
 * - JWT CRM: GET /contratos
 * - MaxiCobranzas vía SV: GET /contratos-from-sv (clave interna)
 */
@Controller('crm-cerradoras')
export class CrmCerradoresContratosController {
  constructor(
    private readonly cerradoresService: CrmCerradoresService,
    private readonly userService: UserService,
  ) {}

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

  private async resolveBridgeUserId(): Promise<string> {
    const userName = process.env.SV_BRIDGE_USER_NAME ?? 'jherry.visalot';
    const user = await this.userService.findByUserName(userName);
    if (!user) {
      throw new InternalServerErrorException(
        `SV bridge user "${userName}" no existe en el CRM`,
      );
    }
    return user.id;
  }

  private parseListQuery(query: ListPacientesQueryDto) {
    return {
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      todayOnly: query.todayOnly === 'true',
      contractType: query.contractType,
    };
  }

  @Public()
  @Get('contratos-from-sv')
  async getContratosFromSv(
    @Headers('x-internal-api-key') apiKeyHeader: string,
    @Headers('authorization') authorization: string,
    @Query() query: ListPacientesQueryDto,
  ) {
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    this.assertInternalApiKey(apiKeyHeader || bearer);
    const userId = await this.resolveBridgeUserId();
    return this.cerradoresService.getContratosCerradoras(userId, this.parseListQuery(query));
  }

  @UseGuards(JwtAuthGuard)
  @Get('contratos')
  async getContratos(
    @Request() req: { user?: { userId?: string } },
    @Query() query: ListPacientesQueryDto,
  ) {
    return this.cerradoresService.getContratosCerradoras(
      req.user?.userId ?? '',
      this.parseListQuery(query),
    );
  }
}
