import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KpiService } from './kpi.service';
import { ResumenEvolutivoQueryDto } from './dto/resumen-evolutivo-query.dto';
import { SvServices } from '../sv-services/sv.services';

@UseGuards(JwtAuthGuard)
@Controller('kpi')
export class KpiController {
  constructor(
    private readonly kpiService: KpiService,
    private readonly svServices: SvServices
  ) {}

  @Get('resumen-evolutivo/unidades')
  async getUnidades(@Query() query: ResumenEvolutivoQueryDto, @Req() req: any) {
    // Obtener token de SV usando credenciales de admin
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getResumenEvolutivoUnidades(
      query.fecha_inicio,
      query.fecha_fin,
      query.page || 1,
      query.limit || 12,
      tokenSv
    );
  }

  @Get('resumen-evolutivo/porcentajes')
  async getPorcentajes(@Query() query: ResumenEvolutivoQueryDto, @Req() req: any) {
    // Obtener token de SV usando credenciales de admin
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getResumenEvolutivoPorcentajes(
      query.fecha_inicio,
      query.fecha_fin,
      query.page || 1,
      query.limit || 12,
      tokenSv
    );
  }
}

