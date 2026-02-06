import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { CampusTeamService } from './campus-team.service';
import { CampusTeam } from './campus-team.entity';
import { AddTeamToCampusDto } from './dto/add-team-to-campus.dto';
import { MoveTeamToCampusDto } from './dto/move-team-to-campus.dto';
import { CampusTeamItemDto } from './dto/campus-team-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('campus-team')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class CampusTeamController {
  constructor(private readonly campusTeamService: CampusTeamService) {}

  /** Listar todas las asignaciones sede ↔ equipo con nombre de sede y nombre de equipo */
  @Get()
  async findAll(): Promise<CampusTeamItemDto[]> {
    return await this.campusTeamService.findAllWithNames();
  }

  /** IDs de sedes que tienen equipos configurados */
  @Get('campuses')
  async getAllCampusIds(): Promise<number[]> {
    return await this.campusTeamService.getAllCampusIds();
  }

  /** Equipos asignados a una sede (por ejemplo Lima = 1) */
  @Get('campus/:campusId')
  async getTeamsByCampus(
    @Param('campusId', ParseIntPipe) campusId: number,
  ): Promise<string[]> {
    return await this.campusTeamService.getTeamIdsByCampusId(campusId);
  }

  /** Mover equipo de una sede a otra (quita de fromCampusId y asigna a toCampusId) */
  @Post('move')
  @HttpCode(HttpStatus.CREATED)
  async moveTeamToCampus(@Body() dto: MoveTeamToCampusDto): Promise<CampusTeam> {
    return await this.campusTeamService.moveTeamToCampus(
      dto.fromCampusId,
      dto.toCampusId,
      dto.teamId,
    );
  }

  /** Asignar equipo a sede (ej. Team Leader Lima a sede 1) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addTeamToCampus(@Body() dto: AddTeamToCampusDto): Promise<CampusTeam> {
    return await this.campusTeamService.addTeamToCampus(dto.campusId, dto.teamId);
  }

  /** Quitar equipo de una sede */
  @Delete('campus/:campusId/team/:teamId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTeamFromCampus(
    @Param('campusId', ParseIntPipe) campusId: number,
    @Param('teamId') teamId: string,
  ): Promise<void> {
    await this.campusTeamService.removeTeamFromCampus(campusId, teamId);
  }
}
