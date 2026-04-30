import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CrmControlesGuard } from 'src/auth/guards/crm-controles.guard';
import { IncidenciasService } from './incidencias.service';
import { CreateIncidenciaDto, UpdateEstadoDto } from './incidencias.dto';

@UseGuards(JwtAuthGuard, CrmControlesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
@Controller('incidencias')
export class IncidenciasController {
  constructor(private readonly service: IncidenciasService) {}

  /** Admin → todas; usuario regular → solo las de sus pacientes asignados. Filtra por área si se pasa ?area= */
  @Get()
  findAll(
    @Request() req: { user?: { userId?: string } },
    @Query('pacienteId') pacienteId?: string,
    @Query('area') area?: string,
  ) {
    const pid = pacienteId ? parseInt(pacienteId, 10) : NaN;
    return this.service.findAllForUser(
      req.user?.userId ?? null,
      !isNaN(pid) ? pid : undefined,
      area || undefined,
    );
  }

  @Post()
  create(@Body() dto: CreateIncidenciaDto) {
    return this.service.create(dto);
  }

  @Patch(':id/estado')
  async updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoDto,
  ) {
    return this.service.updateEstado(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
