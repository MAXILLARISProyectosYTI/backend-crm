import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeamUser } from './team-user.entity';

@Injectable()
export class TeamUserService {
  constructor(
    @InjectRepository(TeamUser)
    private readonly teamUserRepository: Repository<TeamUser>,
  ) {}

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
      // Buscar si existe pero está eliminado
      const existingTeamUser = currentTeamUsers.find(
        tu => tu.teamId === teamId
      );

      if (existingTeamUser) {
        // Reactivar si estaba eliminado
        existingTeamUser.deleted = false;
        const reactivated = await this.teamUserRepository.save(existingTeamUser);
        results.push(reactivated);
      } else {
        // Crear nuevo
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

