import { Injectable } from '@nestjs/common';
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { UserService } from './user.service';
import { RoleService } from 'src/role/role.service';
import { TEAMS_IDS, ROLES_IDS, FILTERED_USERS_TEAM_IDS } from 'src/globals/ids';
import { CampusTeamService } from 'src/campus-team/campus-team.service';

/** Roles CRM que mantienen visión nacional en módulos comerciales (solo vista). */
const NATIONAL_VIEW_ROLE_NAMES = new Set(['gerente', 'administrador']);

/** Equipos meta: no representan un squad comercial gestionable por TL. */
const META_COMMERCIAL_TEAM_IDS = new Set<string>([
  TEAMS_IDS.TEAM_LEADERS_COMERCIALES,
  TEAMS_IDS.TEAM_TI,
  TEAMS_IDS.TEAM_OWNER,
  TEAMS_IDS.ASISTENTES_COMERCIALES,
  TEAMS_IDS.CERRADORAS,
  TEAMS_IDS.EQ_EJECUTIVOS_CONTROLES,
]);

export interface CommercialCampusViewScope {
  /** true → no aplicar filtro por sede en listados */
  unrestricted: boolean;
  campusIds: number[];
}

export type OpportunityViewMode = 'mine' | 'browse';

/** Contexto de permisos comerciales (punto 1 — Ventas + OI). */
export interface CommercialAccessContext {
  userId: string;
  /** Admin, asistente, TI/Owner o Gerente/administrador */
  canManageAll: boolean;
  isTeamLeader: boolean;
  teamUserIds: string[];
  /** Oportunidades con derivación OI activa asignada al usuario */
  derivedOpportunityIds: string[];
  campusScope: CommercialCampusViewScope;
  /** Ejecutivos en equipos mapeados a las sedes visibles (fallback campus null). */
  campusTeamUserIds: string[];
}

/**
 * Alcance de vista del punto 1 — solo CRM Ventas + OI (`findByAssignedUser`).
 * No aplica a cerradoras, controles ni otros módulos.
 */
@Injectable()
export class CommercialScopeService {
  constructor(
    private readonly userService: UserService,
    private readonly roleService: RoleService,
    private readonly campusTeamService: CampusTeamService,
  ) {}

  /** Admin type, TI/Owner o Gerente/administrador → visión nacional. */
  async canSeeAllNational(userId: string): Promise<boolean> {
    if (!userId) return true;
    if (await this.userService.isAdmin(userId)) return true;

    const teams = await this.userService.getAllTeamsByUser(userId);
    if (
      teams.some(
        (t) => t.team_id === TEAMS_IDS.TEAM_TI || t.team_id === TEAMS_IDS.TEAM_OWNER,
      )
    ) {
      return true;
    }

    const roleIds = await this.roleService.getRolesByUser(userId);
    if (roleIds.length === 0) return false;

    const roles = await Promise.all(
      roleIds.map((id) => this.roleService.findOne(id).catch(() => null)),
    );
    return roles.some(
      (r) => r?.name && NATIONAL_VIEW_ROLE_NAMES.has(r.name.trim().toLowerCase()),
    );
  }

  /**
   * Sedes visibles para listados comerciales (ventas/OI).
   * Si no hay restricción verificable, no filtra (unrestricted).
   */
  async resolveCampusViewScope(userId: string): Promise<CommercialCampusViewScope> {
    if (!userId || (await this.canSeeAllNational(userId))) {
      return { unrestricted: true, campusIds: [] };
    }

    const fromTeams = await this.userService.getCampusIdsByUser(userId);
    if (fromTeams.length > 0) {
      return { unrestricted: false, campusIds: [...new Set(fromTeams)] };
    }

    const myCampuses = await this.userService.getMyCampuses(userId);
    if (myCampuses.campusIds.length > 0) {
      return {
        unrestricted: false,
        campusIds: [...new Set(myCampuses.campusIds)],
      };
    }

    /** Sin sede verificable → no mostrar oportunidades (fail-closed). */
    return { unrestricted: false, campusIds: [] };
  }

  /** Equipos asignados a varias sedes (usa API existente del CRM). */
  private async fetchTeamIdsByCampusIds(campusIds: number[]): Promise<string[]> {
    if (campusIds.length === 0) return [];
    const batches = await Promise.all(
      campusIds.map((campusId) =>
        this.campusTeamService.getTeamIdsByCampusId(campusId),
      ),
    );
    return [...new Set(batches.flat())];
  }

  /** Usuarios activos en equipos comerciales de las sedes indicadas. */
  async resolveCampusTeamUserIds(campusIds: number[]): Promise<string[]> {
    if (campusIds.length === 0) return [];
    const teamIds = await this.fetchTeamIdsByCampusIds(campusIds);
    const commercialTeamIds = teamIds.filter(
      (tid) =>
        FILTERED_USERS_TEAM_IDS.includes(tid) &&
        !META_COMMERCIAL_TEAM_IDS.has(tid),
    );
    if (commercialTeamIds.length === 0) return [];
    const users = await this.userService.getUserByAllTeams(commercialTeamIds);
    return [...new Set(users.map((u) => u.user_id).filter(Boolean))];
  }

  /**
   * Aplica filtro de sede sobre oportunidades (c_campus_id / c_campus_atencion_id).
   * `derivedOpportunityIds`: filas derivadas OI del ejecutivo siguen visibles aunque sede difiera.
   */
  applyOpportunityCampusFilter<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    scope: CommercialCampusViewScope,
    derivedOpportunityIds: string[] = [],
  ): void {
    if (scope.unrestricted) return;

    if (scope.campusIds.length === 0) {
      qb.andWhere('1 = 0');
      return;
    }

    const campusIds = scope.campusIds;
    qb.andWhere(
      new Brackets((sub) => {
        sub.where(
          `(${alias}.c_campus_id IN (:...campusIds) OR ${alias}.c_campus_atencion_id IN (:...campusIds))`,
          { campusIds },
        );
        sub.orWhere(
          new Brackets((nullCampus) => {
            nullCampus
              .where(`${alias}.c_campus_id IS NULL`)
              .andWhere(`${alias}.c_campus_atencion_id IS NULL`)
              .andWhere(
                `${alias}.assigned_user_id IN (
                  SELECT tu.user_id FROM team_user tu
                  INNER JOIN campus_team ct ON ct.team_id = tu.team_id
                  WHERE ct.campus_id IN (:...campusIds)
                    AND tu.deleted = false
                )`,
                { campusIds },
              );
          }),
        );
        if (derivedOpportunityIds.length > 0) {
          sub.orWhere(`${alias}.id IN (:...derivedCampusBypassIds)`, {
            derivedCampusBypassIds: derivedOpportunityIds,
          });
        }
      }),
    );
  }

  /** ¿Puede gestionar (no solo ver) esta oportunidad? */
  resolveCanManageOpportunity(
    ctx: CommercialAccessContext,
    opportunity: {
      id: string;
      assignedUserId?: string | { id?: string } | null;
      cCampusId?: number | null;
      cCampusAtencionId?: number | null;
    },
    options?: {
      viewMode?: OpportunityViewMode;
      /** Mutaciones API: TL puede gestionar toda oportunidad dentro de su sede. */
      allowTeamLeaderCampusScope?: boolean;
    },
  ): boolean {
    if (ctx.canManageAll) return true;

    const viewMode = options?.viewMode ?? 'mine';
    const tlManagesCampus =
      ctx.isTeamLeader &&
      (viewMode === 'browse' || options?.allowTeamLeaderCampusScope === true) &&
      this.opportunityInCampusScope(
        opportunity,
        ctx.campusScope,
        ctx.derivedOpportunityIds,
        ctx.campusTeamUserIds,
      );
    if (tlManagesCampus) return true;

    const assignedId =
      opportunity.assignedUserId == null
        ? undefined
        : typeof opportunity.assignedUserId === 'object'
          ? opportunity.assignedUserId.id
          : opportunity.assignedUserId;

    if (assignedId && assignedId === ctx.userId) return true;
    if (ctx.derivedOpportunityIds.includes(opportunity.id)) return true;
    return false;
  }

  /** Oportunidad dentro de las sedes visibles del usuario. */
  private opportunityInCampusScope(
    opportunity: {
      id?: string;
      cCampusId?: number | null;
      cCampusAtencionId?: number | null;
      assignedUserId?: string | { id?: string } | null;
    },
    scope: CommercialCampusViewScope,
    derivedOpportunityIds: string[] = [],
    campusTeamUserIds: string[] = [],
  ): boolean {
    if (scope.unrestricted) return true;
    if (scope.campusIds.length === 0) return false;
    if (opportunity.id && derivedOpportunityIds.includes(opportunity.id)) {
      return true;
    }
    const campusId = opportunity.cCampusId ?? null;
    const atencionId = opportunity.cCampusAtencionId ?? null;
    if (
      (campusId != null && scope.campusIds.includes(campusId)) ||
      (atencionId != null && scope.campusIds.includes(atencionId))
    ) {
      return true;
    }
    if (campusId == null && atencionId == null && campusTeamUserIds.length > 0) {
      const assignedId =
        opportunity.assignedUserId == null
          ? undefined
          : typeof opportunity.assignedUserId === 'object'
            ? opportunity.assignedUserId.id
            : opportunity.assignedUserId;
      if (assignedId && campusTeamUserIds.includes(assignedId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resuelve ejecutivos bajo un TL (equipos comerciales del usuario o de sus sedes).
   */
  async resolveTeamLeaderUserIds(userId: string): Promise<{
    isTeamLeader: boolean;
    teamUserIds: string[];
  }> {
    const teamsUser = await this.userService.getAllTeamsByUser(userId);
    const userTeamIds = new Set(teamsUser.map((t) => t.team_id));

    const userWithRoles = await this.userService.findOne(userId);
    const roles = (userWithRoles as { roles?: { roleId?: string }[] }).roles ?? [];
    const hasTeamLeaderRole = roles.some(
      (r) => r.roleId === ROLES_IDS.TEAM_LEADER_COMERCIAL,
    );
    const isInLeadersTeam = userTeamIds.has(TEAMS_IDS.TEAM_LEADERS_COMERCIALES);
    const isTeamLeader = hasTeamLeaderRole || isInLeadersTeam;

    if (!isTeamLeader) {
      return { isTeamLeader: false, teamUserIds: [] };
    }

    const managedTeamIds = await this.resolveManagedTeamIdsForTeamLeader(
      userId,
      userTeamIds,
    );

    const users =
      managedTeamIds.length > 0
        ? await this.userService.getUserByAllTeams(managedTeamIds)
        : [];
    const teamUserIds = [...new Set(users.map((u) => u.user_id).filter(Boolean))];
    if (!teamUserIds.includes(userId)) {
      teamUserIds.push(userId);
    }
    return { isTeamLeader: true, teamUserIds };
  }

  /** Equipos squad comerciales que el TL gestiona (propios + fallback por sede). */
  private async resolveManagedTeamIdsForTeamLeader(
    userId: string,
    userTeamIds: Set<string>,
  ): Promise<string[]> {
    const fromMembership = [...userTeamIds].filter(
      (tid) =>
        FILTERED_USERS_TEAM_IDS.includes(tid) &&
        !META_COMMERCIAL_TEAM_IDS.has(tid),
    );
    if (fromMembership.length > 0) {
      return [...new Set(fromMembership)];
    }

    const campusIds = await this.userService.getCampusIdsByUser(userId);
    if (campusIds.length === 0) return [];

    const teamIds = await this.fetchTeamIdsByCampusIds(campusIds);
    return teamIds.filter(
      (tid) =>
        FILTERED_USERS_TEAM_IDS.includes(tid) &&
        !META_COMMERCIAL_TEAM_IDS.has(tid),
    );
  }
}
