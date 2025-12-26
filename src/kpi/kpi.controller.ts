import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KpiService } from './kpi.service';
import { ResumenEvolutivoQueryDto } from './dto/resumen-evolutivo-query.dto';
import { ComparativoQueryDto } from './dto/comparativo-query.dto';
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

  @Get('comparativo-mensual')
  async getComparativoMensual(@Query() query: ComparativoQueryDto, @Req() req: any) {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getComparativoMensual(
      query.año_inicio || 0,
      query.año_fin || 0,
      tokenSv
    );
  }

  // Endpoints específicos para gráficos anuales
  @Get('comparativo-vendidas-anual')
  async getComparativoVendidasAnual(@Query() query: ComparativoQueryDto, @Req() req: any) {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getComparativoVendidasAnual(
      query.año_inicio || 0,
      query.año_fin || 0,
      tokenSv
    );
  }

  @Get('comparativo-asistidas-anual')
  async getComparativoAsistidasAnual(@Query() query: ComparativoQueryDto, @Req() req: any) {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getComparativoAsistidasAnual(
      query.año_inicio || 0,
      query.año_fin || 0,
      tokenSv
    );
  }

  @Get('comparativo-moldes-anual')
  async getComparativoMoldesAnual(@Query() query: ComparativoQueryDto, @Req() req: any) {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getComparativoMoldesAnual(
      query.año_inicio || 0,
      query.año_fin || 0,
      tokenSv
    );
  }

  @Get('comparativo-tratamientos-anual')
  async getComparativoTratamientosAnual(@Query() query: ComparativoQueryDto, @Req() req: any) {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getComparativoTratamientosAnual(
      query.año_inicio || 0,
      query.año_fin || 0,
      tokenSv
    );
  }

  // Endpoints específicos para gráficos mensuales
  @Get('comparativo-vendidas-mes')
  async getComparativoVendidasMes(@Query() query: any, @Req() req: any) {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getComparativoVendidasMes(
      query.año_inicio || 0,
      query.año_fin || 0,
      query.mes || 'Dic',
      tokenSv
    );
  }

  @Get('comparativo-asistidas-mes')
  async getComparativoAsistidasMes(@Query() query: any, @Req() req: any) {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getComparativoAsistidasMes(
      query.año_inicio || 0,
      query.año_fin || 0,
      query.mes || 'Dic',
      tokenSv
    );
  }

  @Get('comparativo-moldes-mes')
  async getComparativoMoldesMes(@Query() query: any, @Req() req: any) {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getComparativoMoldesMes(
      query.año_inicio || 0,
      query.año_fin || 0,
      query.mes || 'Dic',
      tokenSv
    );
  }

  @Get('comparativo-tratamientos-mes')
  async getComparativoTratamientosMes(@Query() query: any, @Req() req: any) {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    
    return await this.kpiService.getComparativoTratamientosMes(
      query.año_inicio || 0,
      query.año_fin || 0,
      query.mes || 'Dic',
      tokenSv
    );
  }
}

