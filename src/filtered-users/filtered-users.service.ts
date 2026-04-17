import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/user.entity';
import { FILTERED_USERS_TEAM_IDS, MATCH_SV_USERNAME_ALLOWED_ROLE_IDS, ROLES_IDS, TEAMS_IDS } from 'src/globals/ids';
import { orderListAlphabetic } from 'src/user/utils/orderListAlphabetic';

/** Tipos de usuario que no deben aparecer en el listado (p. ej. EspoCRM). */
const EXCLUDED_USER_TYPES = ['admin', 'system'] as const;

/** Roles cuyos usuarios se excluyen (cerradoras, asistentes de ventas / comercial). */
const EXCLUDED_ROLE_IDS = [ROLES_IDS.CERRADORA, ROLES_IDS.ASISTENTE_COMERCIAL] as const;

/** Roles que tienen permiso para acceder al SV directamente. */
const SV_ALLOWED_ROLE_IDS = [ROLES_IDS.CERRADORA, ROLES_IDS.CONTROLES] as const;

/** Equipos que tienen permiso para acceder al SV directamente (ejecutivos OI). */
const SV_ALLOWED_TEAM_IDS = [TEAMS_IDS.EJ_COMERCIAL_OI] as const;

export type UserPublic = Omit<User, 'password'>;

export interface SvAccessResult {
  /** true si el svUserName corresponde a algún usuario del CRM. */
  hasCrmAccount: boolean;
  /** true si ese usuario CRM tiene rol CERRADORA o CONTROLES (y por tanto puede acceder al SV). */
  allowed: boolean;
}

@Injectable()
export class FilteredUsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /** Query base: equipos según FILTERED_USERS_TEAM_IDS, sin roles/tipos restringidos. */
  private createFilteredUsersQuery() {
    return this.userRepository
      .createQueryBuilder('u')
      .where('u.deleted = :deleted', { deleted: false })
      .andWhere(
        '(u.type IS NULL OR TRIM(LOWER(u.type)) NOT IN (:...excludedTypes))',
        { excludedTypes: [...EXCLUDED_USER_TYPES] },
      )
      .andWhere(
        `EXISTS (
          SELECT 1 FROM team_user tu
          WHERE tu.user_id = u.id
          AND tu.team_id IN (:...allowedTeamIds)
          AND (tu.deleted = false OR tu.deleted IS NULL)
        )`,
        { allowedTeamIds: [...FILTERED_USERS_TEAM_IDS] },
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM role_user ru
          WHERE ru.user_id = u.id
          AND (ru.deleted = false OR ru.deleted IS NULL)
          AND ru.role_id IN (:...excludedRoleIds)
        )`,
        { excludedRoleIds: [...EXCLUDED_ROLE_IDS] },
      );
  }

  /**
   * Usuarios no eliminados en al menos un equipo de FILTERED_USERS_TEAM_IDS
   * (todos los de TEAMS_IDS salvo cerradoras y asistentes comerciales), excluyendo:
   * - tipo admin o system
   * - quienes tengan rol cerradora o asistente comercial (ventas)
   */
  async findUsersExcludingRestrictedRoles(): Promise<UserPublic[]> {
    const users = await this.createFilteredUsersQuery().getMany();

    const ordered = orderListAlphabetic(users);
    return ordered.map((u) => this.withoutPassword(u));
  }

  /**
   * Indica si algún usuario del conjunto filtrado tiene el mismo `c_usersv` y además
   * tiene al menos uno de los roles en MATCH_SV_USERNAME_ALLOWED_ROLE_IDS.
   * `svUserName` debe venir ya validado (no vacío) desde el controlador.
   */
  async matchesSvUserName(svUserName: string): Promise<boolean> {
    const normalized = svUserName.trim();

    const count = await this.createFilteredUsersQuery()
      .andWhere('u.cUsersv IS NOT NULL')
      .andWhere("TRIM(u.cUsersv) <> ''")
      .andWhere('LOWER(TRIM(u.cUsersv)) = LOWER(:sv)', { sv: normalized })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM role_user ru_sv
          WHERE ru_sv.user_id = u.id
          AND (ru_sv.deleted = false OR ru_sv.deleted IS NULL)
          AND ru_sv.role_id IN (:...matchSvRoleIds)
        )`,
        { matchSvRoleIds: [...MATCH_SV_USERNAME_ALLOWED_ROLE_IDS] },
      )
      .getCount();

    return count > 0;
  }

  /**
   * Comprueba si un usuario del SV tiene permitido acceder al SV directamente.
   * Busca en el CRM por `c_usersv = svUserName`:
   * - Si no existe cuenta CRM → { hasCrmAccount: false, allowed: true } (usuario puro SV).
   * - Si existe → verifica si tiene rol CERRADORA o CONTROLES.
   */
  async checkSvAccess(svUserName: string): Promise<SvAccessResult> {
    const normalized = svUserName.trim();

    const crmUser = await this.userRepository
      .createQueryBuilder('u')
      .where('u.deleted = :deleted', { deleted: false })
      .andWhere('u.cUsersv IS NOT NULL')
      .andWhere("TRIM(u.cUsersv) <> ''")
      .andWhere('LOWER(TRIM(u.cUsersv)) = LOWER(:sv)', { sv: normalized })
      .getOne();

    if (!crmUser) {
      return { hasCrmAccount: false, allowed: true };
    }

    if (crmUser.type === 'admin') {
      return { hasCrmAccount: true, allowed: true };
    }

    const allowedByRole = await this.userRepository
      .createQueryBuilder('u')
      .where('u.id = :userId', { userId: crmUser.id })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM role_user ru
          WHERE ru.user_id = u.id
          AND (ru.deleted = false OR ru.deleted IS NULL)
          AND ru.role_id IN (:...svAllowedRoleIds)
        )`,
        { svAllowedRoleIds: [...SV_ALLOWED_ROLE_IDS] },
      )
      .getCount();

    if (allowedByRole > 0) {
      return { hasCrmAccount: true, allowed: true };
    }

    const allowedByTeam = await this.userRepository
      .createQueryBuilder('u')
      .where('u.id = :userId', { userId: crmUser.id })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM team_user tu
          WHERE tu.user_id = u.id
          AND (tu.deleted = false OR tu.deleted IS NULL)
          AND tu.team_id IN (:...svAllowedTeamIds)
        )`,
        { svAllowedTeamIds: [...SV_ALLOWED_TEAM_IDS] },
      )
      .getCount();

    return { hasCrmAccount: true, allowed: allowedByTeam > 0 };
  }

  private withoutPassword(user: User): UserPublic {
    const { password: _pw, ...rest } = user;
    return rest;
  }
}
