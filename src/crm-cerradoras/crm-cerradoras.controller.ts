import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CrmCerradoresGuard } from 'src/auth/guards/crm-cerradoras.guard';
import { AdminUserGuard } from 'src/auth/guards/admin-user.guard';
import { CrmCerradoresService } from './crm-cerradoras.service';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { ResponderSolicitudDto } from './dto/responder-solicitud.dto';
import { ActualizarFirmaDto } from './dto/actualizar-firma.dto';
import { ListPacientesQueryDto } from './dto/list-pacientes-query.dto';

@UseGuards(JwtAuthGuard, CrmCerradoresGuard)
@Controller('crm-cerradoras')
export class CrmCerradoresController {
  constructor(private readonly cerradoresService: CrmCerradoresService) {}

  /**
   * GET /crm-cerradoras/pacientes
   * Lista de pacientes.
   * - Admin: ve todos los pacientes de todas las cerradoras.
   * - Cerradora: ve solo sus pacientes.
   */
  @Get('pacientes')
  async getPacientes(
    @Request() req: { user?: { userId?: string } },
    @Query() query: ListPacientesQueryDto,
  ) {
    return this.cerradoresService.getPacientesCerradora(req.user?.userId ?? '', {
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 5000,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      todayOnly: query.todayOnly === 'true',
      contractType: query.contractType,
    });
  }

  /**
   * POST /crm-cerradoras/pacientes
   * Registra un nuevo paciente en el panel de la cerradora (sin solicitud de demora).
   */
  @Post('pacientes')
  async registrarPaciente(
    @Body() dto: CreateSolicitudDto & { firmaContrato?: 'pendiente' | 'firmado' | 'rechazado'; facturado?: boolean },
    @Request() req: { user?: { userId?: string } },
  ) {
    return this.cerradoresService.registrarPaciente(dto, req.user?.userId ?? '');
  }

  /**
   * GET /crm-cerradoras/solicitudes
   * Lista de solicitudes de demora.
   * - Admin: ve todas.
   * - Cerradora: ve solo las suyas.
   */
  @Get('solicitudes')
  async getSolicitudes(@Request() req: { user?: { userId?: string } }) {
    return this.cerradoresService.getSolicitudes(req.user?.userId ?? '');
  }

  /**
   * GET /crm-cerradoras/solicitudes/pendientes-count
   * Cuenta cuántas solicitudes están en estado "pendiente" (para badge en sidebar admin).
   */
  @UseGuards(AdminUserGuard)
  @Get('solicitudes/pendientes-count')
  async getPendientesCount() {
    const count = await this.cerradoresService.countPendientesAdmin();
    return { count };
  }

  /**
   * POST /crm-cerradoras/solicitudes
   * La cerradora crea una solicitud de demora para un paciente.
   */
  @Post('solicitudes')
  async crearSolicitud(
    @Body() dto: CreateSolicitudDto,
    @Request() req: { user?: { userId?: string } },
  ) {
    return this.cerradoresService.crearSolicitud(dto, req.user?.userId ?? '');
  }

  /**
   * PATCH /crm-cerradoras/solicitudes/:id/responder
   * El admin aprueba o rechaza una solicitud con comentario.
   * Solo accesible por admins.
   */
  @UseGuards(AdminUserGuard)
  @Patch('solicitudes/:id/responder')
  async responderSolicitud(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResponderSolicitudDto,
    @Request() req: { user?: { userId?: string } },
  ) {
    return this.cerradoresService.responderSolicitud(id, dto, req.user?.userId ?? '');
  }

  /**
   * PATCH /crm-cerradoras/solicitudes/:id/firma-contrato
   * La cerradora (o admin) actualiza el estado de firma de contrato y facturación.
   */
  @Patch('solicitudes/:id/firma-contrato')
  async actualizarFirma(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarFirmaDto,
    @Request() req: { user?: { userId?: string } },
  ) {
    return this.cerradoresService.actualizarFirma(id, dto, req.user?.userId ?? '');
  }

  /**
   * PATCH /crm-cerradoras/pacientes/:opportunityId/firma-contrato
   * Actualiza el estado de firma/facturación usando el ID de la oportunidad (crea solicitud si no existe).
   */
  @Patch('pacientes/:opportunityId/firma-contrato')
  async actualizarFirmaPorOportunidad(
    @Param('opportunityId') opportunityId: string,
    @Body() dto: ActualizarFirmaDto,
    @Request() req: { user?: { userId?: string } },
  ) {
    return this.cerradoresService.actualizarFirmaPorOportunidad(opportunityId, dto, req.user?.userId ?? '');
  }
}
