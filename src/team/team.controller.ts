import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { TeamUserService } from '../team-user/team-user.service';
import { Team } from './team.entity';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddUserToTeamDto } from './dto/add-user-to-team.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('team')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly teamUserService: TeamUserService,
  ) {}

  @Get()
  async findAll(): Promise<Team[]> {
    return await this.teamService.findAll();
  }

  @Get('all')
  async findAllLegacy(): Promise<Team[]> {
    return await this.teamService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTeamDto: CreateTeamDto): Promise<Team> {
    return await this.teamService.create(createTeamDto);
  }

  /** Usuarios asignados al equipo (declarar antes de :id para que no se confunda la ruta) */
  @Get(':id/users')
  async getUsersByTeam(@Param('id') id: string): Promise<string[]> {
    await this.teamService.findOne(id);
    return await this.teamUserService.getUserIdsByTeamId(id);
  }

  @Post(':id/users/:userId')
  @HttpCode(HttpStatus.CREATED)
  async addUserToTeam(
    @Param('id') teamId: string,
    @Param('userId') userId: string,
    @Body() body?: AddUserToTeamDto,
  ) {
    return await this.teamService.addUserToTeam(teamId, userId, body);
  }

  @Delete(':id/users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeUserFromTeam(
    @Param('id') teamId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.teamUserService.removeUserFromTeam(teamId, userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Team> {
    return await this.teamService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateTeamDto: UpdateTeamDto,
  ): Promise<Team> {
    return await this.teamService.update(id, updateTeamDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.teamService.remove(id);
  }
}
