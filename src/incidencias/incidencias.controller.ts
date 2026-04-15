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

  @Get()
  findAll(@Query('pacienteId') pacienteId?: string) {
    if (pacienteId) {
      const id = parseInt(pacienteId, 10);
      if (!isNaN(id)) return this.service.findByPaciente(id);
    }
    return this.service.findAll();
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
