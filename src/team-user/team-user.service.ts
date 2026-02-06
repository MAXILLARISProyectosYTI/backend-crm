import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeamUser } from './team-user.entity';

@Injectable()
export class TeamUserService {
  constructor(
    @InjectRepository(TeamUser)
    private readonly teamUserRepository: Repository<TeamUser>,
  ) {}

  /** Obtener asignación usuario-equipo (incluye eliminados). */
  async getAssignment(teamId: string, userId: string): Promise<TeamUser | null> {
    return await this.teamUserRepository.findOne({
      where: { teamId, userId },
    });
  }

  /** IDs de usuarios asignados a un equipo (no eliminados). */
  async getUserIdsByTeamId(teamId: string): Promise<string[]> {
    const rows = await this.teamUserRepository.find({
      where: { teamId, deleted: false },
      select: ['userId'],
    });
    return rows.map((r) => r.userId).filter((id): id is string => Boolean(id));
  }

  /** Asignar un usuario a un equipo. */
  async addUserToTeam(teamId: string, userId: string): Promise<TeamUser> {
    const existing = await this.teamUserRepository.findOne({
      where: { teamId, userId },
    });
    if (existing) {
      if (existing.deleted) {
        existing.deleted = false;
        return await this.teamUserRepository.save(existing);
      }
      throw new Error('El usuario ya está en este equipo');
    }
    const teamUser = this.teamUserRepository.create({
      teamId,
      userId,
      deleted: false,
    });
    return await this.teamUserRepository.save(teamUser);
  }

  /** Quitar usuario del equipo (soft delete). */
  async removeUserFromTeam(teamId: string, userId: string): Promise<void> {
    const row = await this.teamUserRepository.findOne({
      where: { teamId, userId },
    });
    if (!row) {
      throw new NotFoundException('Asignación usuario-equipo no encontrada');
    }
    row.deleted = true;
    await this.teamUserRepository.save(row);
  }

  async createMany(teamsIds: string[], userId: string): Promise<TeamUser[]> {
    const teamUsers = teamsIds.map(teamId => this.teamUserRepository.create({
      teamId,
      userId,
      deleted: false,
    }));
    return await this.teamUserRepository.save(teamUsers);
  }

  async updateMany(teamsIds: string[], userId: string): Promise<TeamUser[]> {
    const currentTeamUsers = await this.getCurrentTeamUsers(userId);

    const currentTeamIds = new Set(
      currentTeamUsers
        .filter(tu => !tu.deleted && tu.teamId)
        .map(tu => tu.teamId as string)
    );
    const newTeamIds = new Set(teamsIds.filter((id): id is string => Boolean(id)));

    // 3. Identificar teams a agregar (están en nuevos pero no en actuales)
    const teamsToAdd = Array.from(newTeamIds).filter(teamId => !currentTeamIds.has(teamId));

    // 4. Identificar teams a eliminar (están en actuales pero no en nuevos)
    const teamsToRemove = Array.from(currentTeamIds).filter(teamId => !newTeamIds.has(teamId));

    const results: TeamUser[] = [];

    // 5. Agregar nuevos teams o reactivar los que estaban eliminados
    for (const teamId of teamsToAdd) {
      // Buscar si existe (incluso si está eliminado) directamente en la base de datos
      const existingTeamUser = await this.teamUserRepository.findOne({
        where: { teamId, userId },
      });

      if (existingTeamUser) {
        // Reactivar si estaba eliminado o ya existe
        existingTeamUser.deleted = false;
        const reactivated = await this.teamUserRepository.save(existingTeamUser);
        results.push(reactivated);
      } else {
        // Crear nuevo solo si no existe
        const newTeamUser = this.teamUserRepository.create({
          teamId,
          userId,
          deleted: false,
        });
        const created = await this.teamUserRepository.save(newTeamUser);
        results.push(created);
      }
    }

    // 6. Eliminar (soft delete) los teams que ya no están en el array
    for (const teamId of teamsToRemove) {
      const teamUserToRemove = currentTeamUsers.find(
        tu => tu.teamId === teamId && !tu.deleted
      );

      if (teamUserToRemove) {
        teamUserToRemove.deleted = true;
        await this.teamUserRepository.save(teamUserToRemove);
      }
    }

    // 7. Retornar todos los TeamUser activos del usuario después de la sincronización
      return await this.getCurrentTeamUsers(userId);
  }

  async getCurrentTeamUsers(userId: string): Promise<TeamUser[]> {
    return await this.teamUserRepository.find({
      where: { userId, deleted: false },
    });
  }
}

