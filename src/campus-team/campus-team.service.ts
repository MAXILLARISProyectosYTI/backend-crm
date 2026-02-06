import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CampusTeam } from './campus-team.entity';
import { Team } from '../team/team.entity';
import { SvServices } from '../sv-services/sv.services';
import { CampusTeamItemDto } from './dto/campus-team-item.dto';

@Injectable()
export class CampusTeamService {
  constructor(
    @InjectRepository(CampusTeam)
    private readonly campusTeamRepository: Repository<CampusTeam>,
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
    private readonly svServices: SvServices,
  ) {}

  /** Devuelve los campus_id en los que participan los equipos indicados (para saber sede del usuario). */
  async getCampusIdsByTeamIds(teamIds: string[]): Promise<number[]> {
    if (teamIds.length === 0) return [];
    const rows = await this.campusTeamRepository
      .createQueryBuilder('ct')
      .select('DISTINCT ct.campusId', 'campusId')
      .where('ct.teamId IN (:...teamIds)', { teamIds })
      .getRawMany();
    return rows.map((r) => (r as any).campusId as number).filter((n) => n != null);
  }

  /** Devuelve los team_id asignados a una sede. Vacío si la sede no tiene configuración. */
  async getTeamIdsByCampusId(campusId: number): Promise<string[]> {
    const rows = await this.campusTeamRepository.find({
      where: { campusId },
      select: ['teamId'],
    });
    return rows.map((r) => r.teamId);
  }

  /** Lista de campus_id que tienen equipos configurados (para listar sedes). Si la tabla está vacía, devuelve [1] por defecto. */
  async getAllCampusIds(): Promise<number[]> {
    const rows = await this.campusTeamRepository
      .createQueryBuilder('ct')
      .select('ct.campusId', 'campusId')
      .groupBy('ct.campusId')
      .orderBy('ct.campusId')
      .getRawMany();
    const ids = rows.map((r) => (r as any).campusId as number).filter((n) => n != null);
    return ids.length > 0 ? ids : [1];
  }

  /** Asignar un equipo a una sede. */
  async addTeamToCampus(campusId: number, teamId: string): Promise<CampusTeam> {
    const existing = await this.campusTeamRepository.findOne({
      where: { campusId, teamId },
    });
    if (existing) {
      throw new ConflictException('El equipo ya está asignado a esta sede');
    }
    const row = this.campusTeamRepository.create({ campusId, teamId });
    return await this.campusTeamRepository.save(row);
  }

  /** Quitar un equipo de una sede. */
  async removeTeamFromCampus(campusId: number, teamId: string): Promise<void> {
    const row = await this.campusTeamRepository.findOne({
      where: { campusId, teamId },
    });
    if (!row) {
      throw new NotFoundException('Asignación sede-equipo no encontrada');
    }
    await this.campusTeamRepository.remove(row);
  }

  /**
   * Mover un equipo de una sede a otra: quita la asignación en fromCampusId y crea la asignación en toCampusId.
   */
  async moveTeamToCampus(
    fromCampusId: number,
    toCampusId: number,
    teamId: string,
  ): Promise<CampusTeam> {
    if (fromCampusId === toCampusId) {
      throw new ConflictException(
        'La sede de origen y la de destino no pueden ser la misma',
      );
    }
    await this.removeTeamFromCampus(fromCampusId, teamId);
    return await this.addTeamToCampus(toCampusId, teamId);
  }

  /** Listar todas las asignaciones sede-equipo (para admin). */
  async findAll(): Promise<CampusTeam[]> {
    return await this.campusTeamRepository.find({
      order: { campusId: 'ASC', teamId: 'ASC' },
    });
  }

  /**
   * Listar todas las asignaciones sede-equipo con nombre de sede y nombre de equipo.
   * GET /campus-team
   */
  async findAllWithNames(): Promise<CampusTeamItemDto[]> {
    const rows = await this.campusTeamRepository.find({
      order: { campusId: 'ASC', teamId: 'ASC' },
    });

    const teamIds = [...new Set(rows.map((r) => r.teamId).filter(Boolean))];
    const teams =
      teamIds.length > 0
        ? await this.teamRepository.find({
            where: { id: In(teamIds) },
            select: ['id', 'name'],
          })
        : [];
    const teamNameById = new Map(teams.map((t) => [t.id, t.name ?? null]));

    let campusNameById = new Map<number, string>();
    try {
      const { tokenSv } = await this.svServices.getTokenSvAdmin();
      const campuses = await this.svServices.getCampuses(tokenSv);
      campusNameById = new Map(campuses.map((c) => [c.id, c.name]));
    } catch {
      // Si falla SV (token, red, etc.), los nombres de sede quedarán null
    }

    return rows.map((r) => ({
      campusId: r.campusId,
      teamId: r.teamId,
      campusName: campusNameById.get(r.campusId) ?? null,
      teamName: teamNameById.get(r.teamId) ?? null,
    }));
  }
}
