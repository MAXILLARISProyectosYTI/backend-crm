import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Team } from './team.entity';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddUserToTeamDto } from './dto/add-user-to-team.dto';
import { IdGeneratorService } from '../common/services/id-generator.service';
import { TeamUserService } from '../team-user/team-user.service';
import { TeamUser } from '../team-user/team-user.entity';

export interface AddUserToTeamResult {
  teamUser: TeamUser;
  message: string;
}

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
    private readonly idGeneratorService: IdGeneratorService,
    private readonly teamUserService: TeamUserService,
  ) {}

  async findAll(): Promise<Team[]> {
    return await this.teamRepository.find({
      where: { deleted: false },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Team> {
    const team = await this.teamRepository.findOne({ where: { id } });
    if (!team) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }
    return team;
  }

  async create(createTeamDto: CreateTeamDto): Promise<Team> {
    const team = this.teamRepository.create({
      id: this.idGeneratorService.generateId(),
      name: createTeamDto.name,
      positionList: createTeamDto.positionList,
      deleted: false,
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    return await this.teamRepository.save(team);
  }

  async update(id: string, updateTeamDto: UpdateTeamDto): Promise<Team> {
    const team = await this.findOne(id);
    Object.assign(team, updateTeamDto);
    team.modifiedAt = new Date();
    return await this.teamRepository.save(team);
  }

  async remove(id: string): Promise<void> {
    const team = await this.findOne(id);
    team.deleted = true;
    team.modifiedAt = new Date();
    await this.teamRepository.save(team);
  }

  /**
   * Asignar usuario a un equipo, con confirmaciones si ya está en este equipo o en otro.
   * Si mover === true, se quita al usuario de todos los equipos actuales y se asigna solo a este.
   */
  async addUserToTeam(
    teamId: string,
    userId: string,
    dto?: AddUserToTeamDto,
  ): Promise<AddUserToTeamResult> {
    const currentTeam = await this.findOne(teamId);
    let currentAssignments = await this.teamUserService.getCurrentTeamUsers(userId);

    // mover: quitar de todos los equipos actuales excepto el destino, luego asignar al destino
    if (dto?.mover) {
      const otherTeamIds = currentAssignments
        .map((a) => a.teamId)
        .filter((id): id is string => Boolean(id) && id !== teamId);
      for (const otherId of otherTeamIds) {
        try {
          await this.teamUserService.removeUserFromTeam(otherId, userId);
        } catch {
          // ignorar si no existía la asignación
        }
      }
      currentAssignments = await this.teamUserService.getCurrentTeamUsers(userId);
    }

    const assignmentInThisTeam = await this.teamUserService.getAssignment(teamId, userId);
    const teamName = currentTeam.name ?? currentTeam.id;

    // Ya está en este equipo (activo)
    if (assignmentInThisTeam && !assignmentInThisTeam.deleted) {
      if (!dto?.confirm && !dto?.mover) {
        throw new ConflictException(
          `El usuario ya está asignado al equipo "${teamName}". Para confirmar esta operación envíe confirm: true en el body.`,
        );
      }
      return {
        teamUser: assignmentInThisTeam,
        message: dto?.mover
          ? `Usuario movido al equipo "${teamName}" (quitado de otros equipos).`
          : `El usuario ya está asignado al equipo "${teamName}".`,
      };
    }

    // Ya está en otro(s) equipo(s) -> asignación doble (solo si no usamos mover)
    const otherTeamIds = currentAssignments
      .map((a) => a.teamId)
      .filter((id): id is string => Boolean(id) && id !== teamId);
    if (otherTeamIds.length > 0) {
      const otherTeams = await this.teamRepository.find({
        where: { id: In(otherTeamIds) },
        select: ['id', 'name'],
      });
      const otherNames = otherTeams.map((t) => t.name ?? t.id).join(', ');
      if (!dto?.confirmAsignacionDoble || !dto?.confirmConsecuencias) {
        throw new ConflictException(
          `El usuario ya está asignado al equipo "${otherNames}". Para moverlo a este equipo envíe mover: true en el body, o para asignación doble confirmAsignacionDoble: true y confirmConsecuencias: true.`,
        );
      }
    }

    const teamUser = await this.teamUserService.addUserToTeam(teamId, userId);
    const message =
      otherTeamIds.length > 0
        ? `Usuario asignado al equipo "${teamName}". Tenga en cuenta que también está asignado a otros equipos.`
        : `Usuario asignado al equipo "${teamName}".`;
    return { teamUser, message };
  }
}
