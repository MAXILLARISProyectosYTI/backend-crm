import { BadRequestException, Injectable, NotFoundException, Inject, forwardRef, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserWithAssignmentsDto } from './dto/user-with-assignments.dto';
import { CurrentUserAssignmentsDto } from './dto/current-user-assignments.dto';
import { Opportunity } from '../opportunity/opportunity.entity';
import { getTeamsBySubCampaing } from './utils/getTeamsBySubCampaing';
import { orderListAlphabetic } from './utils/orderListAlphabetic';
import { UserWithTeam } from './dto/user-with-team';
import { CAMPAIGNS_IDS, SUB_CAMPAIGN_NAMES, TEAMS_IDS } from '../globals/ids';
import { OpportunityService } from 'src/opportunity/opportunity.service';
import { getNextUser } from './utils/getNextUser';
import { TeamUserService } from 'src/team-user/team-user.service';
import type {
  AssignmentQueueByCampusDto,
  AssignmentQueueItem,
  NextToAssignDto,
  LastAssignedDto,
  AssignmentQueuesBySedeDto,
  SedeAssignmentDto,
  CampañaEnSedeDto,
  ColaPorSedeItemDto,
  ColaItemDatosAdicionalesDto,
  ColaUltimoAsignadoItemDto,
  ColaSiguienteItemDto,
} from './dto/assignment-queue.dto';
import { formatHaceCuanto } from './utils/formatHaceCuanto';
import { formatDateToLima } from './utils/formatDateToLima';
import { RoleService } from 'src/role/role.service';
import { IdGeneratorService } from 'src/common/services/id-generator.service';
import { CampusTeamService } from 'src/campus-team/campus-team.service';
import { AssignmentQueueStateService } from '../assignment-queue-state/assignment-queue-state.service';
import * as bcrypt from 'bcryptjs';

export interface RoleSummary {
  id: string;
  name?: string;
}

export type UserWithRoles = User & { roles: RoleSummary[] };

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @Inject(forwardRef(() => OpportunityService))
    private readonly opportunityService: OpportunityService,
    private readonly teamUserService: TeamUserService,
    private readonly roleService: RoleService,
    private readonly idGeneratorService: IdGeneratorService,
    private readonly campusTeamService: CampusTeamService,
    private readonly assignmentQueueStateService: AssignmentQueueStateService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {

    const existUser = await this.userRepository.findOne({
      where: { userName: createUserDto.userName },
    });

    if(existUser){
      throw new ConflictException('El usuario ya existe');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      id: (this.idGeneratorService.generateId()),
      createdAt: new Date(),
      modifiedAt: new Date(),
      deleted: false,
    });

    const savedUser = await this.userRepository.save(user);
    await this.teamUserService.createMany(createUserDto.teamsIds, savedUser.id);
    await this.roleService.createMany(createUserDto.rolesIds, savedUser.id);
    return savedUser;
  }

  async findAll(): Promise<User[]> {
    return await this.userRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findAllWithPagination(
    page: number = 1,
    limit: number = 10,
    search?: string,
    teamIds?: string[]
  ): Promise<{ users: User[], total: number, page: number, totalPages: number }> {
    // Query builder para obtener usuarios
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .where('user.deleted = :deleted', { deleted: false });

    // Query builder para el conteo
    const countQueryBuilder = this.userRepository
      .createQueryBuilder('user')
      .where('user.deleted = :deleted', { deleted: false });

    // Filtro por equipos
    if (teamIds && teamIds.length > 0) {
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1 FROM team_user tu 
          WHERE tu.user_id = user.id 
          AND tu.team_id IN (:...teamIds) 
          AND tu.deleted = false
        )`,
        { teamIds }
      );

      countQueryBuilder.andWhere(
        `EXISTS (
          SELECT 1 FROM team_user tu 
          WHERE tu.user_id = user.id 
          AND tu.team_id IN (:...teamIds) 
          AND tu.deleted = false
        )`,
        { teamIds }
      );
    }

    // Búsqueda por nombre, apellido o username
    if (search && search.trim()) {
      const searchParam = `%${search.trim()}%`;
      queryBuilder.andWhere(
        '(user.first_name ILIKE :search OR user.last_name ILIKE :search OR user.user_name ILIKE :search)',
        { search: searchParam }
      );
      countQueryBuilder.andWhere(
        '(user.first_name ILIKE :search OR user.last_name ILIKE :search OR user.user_name ILIKE :search)',
        { search: searchParam }
      );
    }

    // Obtener el total
    const total = await countQueryBuilder.getCount();

    // Aplicar paginación y ordenamiento para obtener usuarios
    const users = await queryBuilder
      .orderBy('user.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const totalPages = Math.ceil(total / limit);

    return {
      users,
      total,
      page,
      totalPages,
    };
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    const teamUsers = await this.teamUserService.getCurrentTeamUsers(id);
    const roleUsers = await this.roleService.getCurrentRoleUsers(id);
    return {...user, teams: teamUsers, roles: roleUsers};
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    
    // Si se está actualizando la contraseña, hashearla antes de guardar
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    
    // Actualizar campos con los nuevos valores
    Object.assign(user, updateUserDto);
    
    // Actualizar timestamp de modificación
    user.modifiedAt = new Date();

    if(updateUserDto.teamsIds){
      await this.teamUserService.updateMany(updateUserDto.teamsIds, id);
    }

    if(updateUserDto.rolesIds){
      await this.roleService.updateMany(updateUserDto.rolesIds, id);
    }
    
    return await this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const result = await this.userRepository.delete(id);
    
    if (result.affected === 0) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
  }

  // Métodos adicionales útiles
  async findByUserName(userName: string): Promise<UserWithRoles> {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('role_user', 'ru', 'ru.user_id = user.id AND (ru.deleted = false OR ru.deleted IS NULL)')
      .leftJoin('role', 'r', 'r.id = ru.role_id AND (r.deleted = false OR r.deleted IS NULL)')
      .where('user.user_name = :userName', { userName })
      .addSelect('r.id', 'role_id')
      .addSelect('r.name', 'role_name');

    const { entities, raw } = await queryBuilder.getRawAndEntities();

    const user = entities[0];

    if (!user) {
      throw new NotFoundException(`Usuario con nombre de usuario ${userName} no encontrado`);
    }

    const rolesMap = new Map<string, RoleSummary>();
    raw.forEach(row => {
      const roleId: string | null = row['role_id'] ?? null;
      if (roleId) {
        rolesMap.set(roleId, {
          id: roleId,
          name: row['role_name'] ?? undefined,
        });
      }
    });

    const userWithRoles = user as UserWithRoles;
    userWithRoles.roles = Array.from(rolesMap.values());

    return userWithRoles;
  }

  async findActiveUsers(): Promise<User[]> {
    const users = await this.userRepository.find({
      where: { isActive: true, deleted: false },
      order: { firstName: 'ASC', lastName: 'ASC' },
    });

    return orderListAlphabetic(users);
  }

  async getUsersToAssign(): Promise<User[]> {
    const users = await this.userRepository.find({
      where: { isActive: true, deleted: false, cOcupado: false },
      order: { firstName: 'ASC', lastName: 'ASC' },
    });
    return orderListAlphabetic(users);
  }

  async findByType(type: string): Promise<User[]> {
    return await this.userRepository.find({
      where: { type },
      order: { createdAt: 'DESC' },
    });
  }

  async findByTeam(teamId: string): Promise<User[]> {
    return await this.userRepository.find({
      where: { defaultTeamId: teamId, deleted: false },
      order: { firstName: 'ASC', lastName: 'ASC' },
    });
  }

  async findUsersByContact(contactId: string): Promise<User[]> {
    return await this.userRepository.find({
      where: { contactId },
      order: { createdAt: 'DESC' },
    });
  }

  async softDelete(id: string): Promise<User> {
    const user = await this.findOne(id);
    user.deleted = true;
    user.modifiedAt = new Date();
    return await this.userRepository.save(user);
  }

  async activateUser(id: string): Promise<User> {
    const user = await this.findOne(id);
    user.isActive = true;
    user.modifiedAt = new Date();
    return await this.userRepository.save(user);
  }

  async deactivateUser(id: string): Promise<User> {
    const user = await this.findOne(id);
    user.isActive = false;
    user.modifiedAt = new Date();
    return await this.userRepository.save(user);
  }

  async getUsersWithOpportunities(): Promise<User[]> {
    // Este método podría usar una consulta más compleja para obtener usuarios que tienen oportunidades asignadas
    return await this.userRepository
      .createQueryBuilder('user')
      .where('user.isActive = :isActive', { isActive: true })
      .orderBy('user.firstName', 'ASC')
      .addOrderBy('user.lastName', 'ASC')
      .getMany();
  }

  async getUserWithAssignments(userId: string): Promise<UserWithAssignmentsDto> {
    // Obtener información del usuario logueado
    const user = await this.findOne(userId);
    
    // Obtener todas las oportunidades asignadas a este usuario
    const assignedOpportunities = await this.opportunityRepository.find({
      where: { assignedUserId: { id: userId }, deleted: false },
      select: ['id', 'assignedUserId', 'name', 'amount', 'stage', 'createdAt']
    });

    // Obtener IDs únicos de usuarios que tienen oportunidades asignadas por este usuario
    const assignedUserIds = [...new Set(assignedOpportunities.map(opp => opp.assignedUserId).filter(Boolean))];
    
    // Obtener información de los usuarios asignados
    const assignedUsers = assignedUserIds.length > 0 
      ? await this.userRepository.find({
          where: { id: In(assignedUserIds) },
          select: ['id', 'userName', 'firstName', 'lastName', 'title', 'avatarColor', 'isActive', 'type']
        })
      : [];

    // Contar oportunidades por usuario asignado
    const opportunitiesByUser = assignedOpportunities.reduce((acc, opp) => {
      if (opp.assignedUserId) {
        acc[opp.assignedUserId.id] = (acc[opp.assignedUserId.id] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // Construir la respuesta
    const assignedUsersWithCount = assignedUsers.map(assignedUser => ({
      id: assignedUser.id,
      userName: assignedUser.userName,
      firstName: assignedUser.firstName,
      lastName: assignedUser.lastName,
      title: assignedUser.title,
      avatarColor: assignedUser.avatarColor,
      isActive: assignedUser.isActive,
      type: assignedUser.type,
      assignedOpportunitiesCount: opportunitiesByUser[assignedUser.id] || 0
    }));

    return {
      id: user.id,
      userName: user.userName,
      firstName: user.firstName,
      lastName: user.lastName,
      title: user.title,
      avatarColor: user.avatarColor,
      isActive: user.isActive,
      type: user.type,
      assignedUsers: assignedUsersWithCount,
      totalAssignedOpportunities: assignedOpportunities.length,
      totalAssignedUsers: assignedUsersWithCount.length
    };
  }

  async getCurrentUserAssignments(userId: string): Promise<CurrentUserAssignmentsDto> {
    // Obtener información del usuario logueado
    const user = await this.findOne(userId);
    
    // Obtener oportunidades asignadas directamente a este usuario
    const myOpportunities = await this.opportunityRepository.find({
      where: { assignedUserId: { id: userId }, deleted: false },
      select: ['id', 'name', 'amount', 'stage', 'createdAt'],
      order: { createdAt: 'DESC' }
    });

    // Obtener oportunidades donde este usuario es el creador (para encontrar usuarios que gestiona)
    const managedOpportunities = await this.opportunityRepository.find({
      where: { createdById: userId, deleted: false },
      select: ['id', 'assignedUserId', 'name', 'amount', 'stage', 'createdAt']
    });

    // Obtener IDs únicos de usuarios que tienen oportunidades creadas por este usuario
    const managedUserIds = [...new Set(managedOpportunities.map(opp => opp.assignedUserId).filter(Boolean))];
    
    // Obtener información de los usuarios gestionados
    const managedUsers = managedUserIds.length > 0 
      ? await this.userRepository.find({
          where: { id: In(managedUserIds) },
          select: ['id', 'userName', 'firstName', 'lastName', 'title', 'avatarColor', 'isActive', 'type']
        })
      : [];

    // Contar oportunidades por usuario gestionado
    const opportunitiesByManagedUser = managedOpportunities.reduce((acc, opp) => {
      if (opp.assignedUserId) {
        acc[opp.assignedUserId.id] = (acc[opp.assignedUserId.id] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // Construir la respuesta
    const managedUsersWithCount = managedUsers.map(managedUser => ({
      id: managedUser.id,
      userName: managedUser.userName,
      firstName: managedUser.firstName,
      lastName: managedUser.lastName,
      title: managedUser.title,
      avatarColor: managedUser.avatarColor,
      isActive: managedUser.isActive,
      type: managedUser.type,
      assignedOpportunitiesCount: opportunitiesByManagedUser[managedUser.id] || 0
    }));

    return {
      id: user.id,
      userName: user.userName,
      firstName: user.firstName,
      lastName: user.lastName,
      title: user.title,
      avatarColor: user.avatarColor,
      isActive: user.isActive,
      type: user.type,
      managedUsers: managedUsersWithCount,
      myOpportunities: myOpportunities,
      totalManagedOpportunities: managedOpportunities.length,
      totalManagedUsers: managedUsersWithCount.length,
      totalMyOpportunities: myOpportunities.length
    };
  }

  async getUserByAllTeams(teams: string[]): Promise<UserWithTeam[]> {

    const users = await this.userRepository.createQueryBuilder('u')
    .leftJoin('team_user', 'tu', 'u.id = tu.user_id')
    .leftJoin('team', 't', 't.id = tu.team_id')
    .select([
      'u.id AS user_id',
      'u.user_name AS user_name', 
      't.name AS team_name',
      't.id AS team_id'
    ])
    .where('t.id IN (:...teamIds)', { teamIds: teams })
    .andWhere('u.deleted = :deleted', { deleted: false })
    .andWhere('t.deleted = :deleted', { deleted: false })
    .andWhere('tu.deleted = :deleted', { deleted: false })
    .andWhere('u.cOcupado = :cOcupado', { cOcupado: false })
    .getRawMany();
    return users
  }

  async getUsersBySubCampaignId(subCampaignId: string): Promise<User[]> {
    return this.getUsersBySubCampaignIdAndCampusId(subCampaignId, undefined);
  }

  /**
   * IDs de equipos permitidos para una sede y subcampaña.
   * Si la sede tiene equipos en campus_team: usa la intersección con la subcampaña;
   * si la intersección es vacía, usa los equipos de la sede para que la sede muestre solo sus usuarios (ej. campus 15 = Equipo Arequipa).
   */
  private async getAllowedTeamIdsForCampusAndSubcampaign(
    campusId: number,
    subCampaignId: string,
  ): Promise<string[]> {
    let teams = getTeamsBySubCampaing(subCampaignId);
    if (teams.length === 0) return [];
    const campusTeamIds = await this.campusTeamService.getTeamIdsByCampusId(campusId);
    if (campusTeamIds.length > 0) {
      const allowed = teams.filter((t) => campusTeamIds.includes(t));
      teams = allowed.length > 0 ? allowed : campusTeamIds;
    }
    return teams;
  }

  /**
   * Usuarios asignables para una subcampaña y opcionalmente una sede.
   * Si campusId viene y la sede tiene equipos en campus_team: usa intersección con la subcampaña;
   * si la intersección es vacía, usa solo los equipos de la sede (ej. campus 15 solo muestra su equipo).
   */
  async getUsersBySubCampaignIdAndCampusId(subCampaignId: string, campusId?: number): Promise<User[]> {
    const usersActives = await this.getUsersToAssign();
    if (usersActives.length === 0) return [];

    let teams = getTeamsBySubCampaing(subCampaignId);
    if (teams.length === 0) {
      throw new BadRequestException('No hay equipos asignados a esta subcampaña');
    }

    if (campusId != null) {
      const campusTeamIds = await this.campusTeamService.getTeamIdsByCampusId(campusId);
      if (campusTeamIds.length > 0) {
        const allowedTeams = teams.filter((t) => campusTeamIds.includes(t));
        teams = allowedTeams.length > 0 ? allowedTeams : campusTeamIds;
      }
    }

    const usersByAllTeams = await this.getUserByAllTeams(teams);
    const teamUserIds = usersByAllTeams.map((teamUser) => teamUser.user_id);
    const filteredUsers = usersActives.filter((user) => teamUserIds.includes(user.id));
    return orderListAlphabetic(filteredUsers);
  }

  async getNextUserToAssign(subCampaignId: string, campusId?: number): Promise<any> {
    const listUsers = await this.getUsersBySubCampaignIdAndCampusId(subCampaignId, campusId);
    let listUsersDefault: UserWithTeam[]

    // Si no hay usuarios activos, asignar por defecto
    if(listUsers.length === 0){
      switch(subCampaignId) {
        case CAMPAIGNS_IDS.OI:
          listUsersDefault = await this.getUserByAllTeams([TEAMS_IDS.EJ_COMERCIAL_OI]);
          break;
        case CAMPAIGNS_IDS.OFM:
          listUsersDefault = await this.getUserByAllTeams([TEAMS_IDS.TEAM_LEADERS_COMERCIALES]);
          break;
        case CAMPAIGNS_IDS.APNEA:
          listUsersDefault = await this.getUserByAllTeams([TEAMS_IDS.EJ_COMERCIAL_APNEA]);
          break;
        default:
          throw new BadRequestException('Subcampaña no reconocida para asignación por defecto')
      }

      if (!listUsersDefault?.length) {
        throw new BadRequestException('NO_USUARIOS_PARA_ASIGNAR');
      }
      const userSelected = listUsersDefault[Math.floor(Math.random() * listUsersDefault.length)];
      return await this.findOne(userSelected.user_id);
    }

    // Cola estable: usar estado guardado cuando hay sede; si no, derivar de última oportunidad
    if (campusId != null) {
      const state = await this.assignmentQueueStateService.getState(campusId, subCampaignId);
      if (state) {
        const lastUserName = listUsers.find((u) => u.id === state.lastAssignedUserId)?.userName ?? '';
        const lastAssignedRef = {
          opportunity_id: state.lastOpportunityId ?? '',
          opportunity_name: '',
          assigned_user_id: state.lastAssignedUserId,
          assigned_user_user_name: lastUserName,
        };
        const nextUser = getNextUser(listUsers, lastAssignedRef);
        if (nextUser) return nextUser;
      }
    }

    const lastOpportunityAssigned = await this.opportunityService.getLastOpportunityAssigned(subCampaignId, campusId);
    const nextUser = lastOpportunityAssigned
      ? getNextUser(listUsers, lastOpportunityAssigned)
      : listUsers[0];

    if(!nextUser){
      throw new BadRequestException('No se encontro el siguiente usuario a asignar')
    }

    return nextUser
  }

  async getAllTeamsByUser(userId: string): Promise<{team_id: string, team_name: string}[]> {
    const teams = await this.userRepository
      .createQueryBuilder('u')
      .select([
        't.id AS team_id',
        't.name AS team_name'
      ])
      .leftJoin('team_user', 'tu', 'u.id = tu.user_id')
      .leftJoin('team', 't', 't.id = tu.team_id')
      .where('u.id = :userId', { userId })
      .andWhere('tu.deleted IS FALSE')
      .getRawMany();
  
    return teams;
  }

  /** Campus (sedes) a los que pertenece el usuario según sus equipos. Vacío si no tiene equipos en campus_team. */
  async getCampusIdsByUser(userId: string): Promise<number[]> {
    const teams = await this.getAllTeamsByUser(userId);
    const teamIds = teams.map((t) => t.team_id).filter(Boolean);
    return this.campusTeamService.getCampusIdsByTeamIds(teamIds);
  }

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.findOne(userId);
    return user.type === 'admin';
  }

  async getUsersCommercials(): Promise<User[]> {

    const usersActives = await this.getUsersToAssign()

    if(usersActives.length === 0){
      return []
    }

    let users: User[] = []
    const teams = [
      TEAMS_IDS.TEAM_LEADERS_COMERCIALES, 
      TEAMS_IDS.EJ_COMERCIAL,
      TEAMS_IDS.TEAM_FIORELLA,
      TEAMS_IDS.TEAM_MICHELL,
      TEAMS_IDS.TEAM_VERONICA,
      TEAMS_IDS.EJ_COMERCIAL_APNEA,
      TEAMS_IDS.EJ_COMERCIAL_OI
    ];
    
    const allUsers = await this.getUserByAllTeams(teams)

    // Obtener solo los usuarios que están en ambos arrays (intersección)
    const userIdsActives = usersActives.map(user => user.id);
    const userIdsFromTeams = allUsers.map(user => user.user_id);
    
    // Encontrar la intersección de ambos arrays
    const commonUserIds = userIdsActives.filter(id => userIdsFromTeams.includes(id));
    
    for(const userId of commonUserIds) {
      const userFound = await this.findOne(userId)
      users.push(userFound)
    } 

    return orderListAlphabetic(users);
  }

  /**
   * Cola de asignación por sede y subcampaña: lista ordenada de usuarios,
   * quién es el siguiente a asignar y quién fue el último asignado (con número y fecha).
   * Usa assignment_queue_state cuando existe (cola estable); si no, deriva de oportunidades (fallback).
   */
  async getAssignmentQueueByCampus(campusId: number, subCampaignId: string): Promise<AssignmentQueueByCampusDto> {
    const listUsers = await this.getUsersBySubCampaignIdAndCampusId(subCampaignId, campusId);
    const state = await this.assignmentQueueStateService.getState(campusId, subCampaignId);

    let nextUser: User | null = null;
    let lastAssigned: LastAssignedDto | null = null;
    let lastAssignedUserId: string | null = null;
    let assignedAt = '';
    let opportunityId: string | undefined;

    if (state) {
      lastAssignedUserId = state.lastAssignedUserId;
      assignedAt = state.lastAssignedAt instanceof Date ? state.lastAssignedAt.toISOString() : String(state.lastAssignedAt);
      opportunityId = state.lastOpportunityId ?? undefined;
      if (listUsers.length > 0) {
        const lastUserName = listUsers.find((u) => u.id === state.lastAssignedUserId)?.userName ?? '';
        const lastAssignedRef = {
          opportunity_id: state.lastOpportunityId ?? '',
          opportunity_name: '',
          assigned_user_id: state.lastAssignedUserId,
          assigned_user_user_name: lastUserName,
        };
        nextUser = getNextUser(listUsers, lastAssignedRef);
      }
    } else {
      const lastOpp = await this.opportunityService.getLastOpportunityAssigned(subCampaignId, campusId);
      lastAssignedUserId = lastOpp?.assigned_user_id ?? null;
      assignedAt =
        lastOpp?.assigned_at != null
          ? typeof lastOpp.assigned_at === 'string'
            ? lastOpp.assigned_at
            : (lastOpp.assigned_at as Date)?.toISOString?.() ?? ''
          : '';
      opportunityId = lastOpp?.opportunity_id;
      if (listUsers.length > 0) {
        nextUser = lastOpp?.assigned_user_id ? getNextUser(listUsers, lastOpp) : listUsers[0];
      }
    }

    const queue: AssignmentQueueItem[] = listUsers.map((user, index) => ({
      user,
      position: index + 1,
      isNext: nextUser?.id === user.id,
      isLastAssigned: lastAssignedUserId === user.id,
    }));

    const nextToAssign: NextToAssignDto | null =
      nextUser != null
        ? {
            user: nextUser,
            position: queue.find((q) => q.user.id === nextUser!.id)?.position ?? 0,
          }
        : null;

    if (lastAssignedUserId) {
      const lastUser = listUsers.find((u) => u.id === lastAssignedUserId);
      if (lastUser) {
        const position = queue.find((q) => q.user.id === lastUser.id)?.position ?? 0;
        lastAssigned = {
          user: lastUser,
          position,
          assignedAt,
          opportunityId,
        };
      }
    }

    return {
      campusId,
      subCampaignId,
      queue,
      nextToAssign,
      lastAssigned,
    };
  }

  /**
   * Orden: sede (padre) → dentro campañas → dentro ejecutivos (colas por tipo/team leader).
   * Sin parámetros: devuelve todas las sedes con sus campañas y colas.
   */
  async getAssignmentQueues(): Promise<AssignmentQueuesBySedeDto> {
    const campusIds = await this.campusTeamService.getAllCampusIds();
    const subCampaignIds = [CAMPAIGNS_IDS.OI, CAMPAIGNS_IDS.OFM, CAMPAIGNS_IDS.APNEA];
    const sedes: SedeAssignmentDto[] = [];

    for (const campusId of campusIds) {
      const campañas: CampañaEnSedeDto[] = [];

      for (const subCampaignId of subCampaignIds) {
        const data = await this.getAssignmentQueueByCampus(campusId, subCampaignId);
        const lastDatesByUser = await this.opportunityService.getLastAssignmentDatesByUser(
          subCampaignId,
          campusId,
        );

        const allowedTeamIds = await this.getAllowedTeamIdsForCampusAndSubcampaign(campusId, subCampaignId);
        const usersWithTeams = allowedTeamIds.length > 0 ? await this.getUserByAllTeams(allowedTeamIds) : [];
        const teamNamesByUserId = new Map<string, string[]>();
        for (const row of usersWithTeams) {
          const arr = teamNamesByUserId.get(row.user_id) ?? [];
          const name = (row.team_name ?? '').trim();
          if (name && !arr.includes(name)) arr.push(name);
          teamNamesByUserId.set(row.user_id, arr);
        }

        const getTeamName = (userId: string): string | null => {
          const arr = teamNamesByUserId.get(userId);
          return arr?.length ? arr.join(', ') : null;
        };

        const colaUltimoAsignado: ColaUltimoAsignadoItemDto[] = data.lastAssigned
          ? [
              {
                user: data.lastAssigned.user,
                numero: data.lastAssigned.position,
                teamName: getTeamName(data.lastAssigned.user.id),
                hora: formatDateToLima(data.lastAssigned.assignedAt) ?? data.lastAssigned.assignedAt ?? '',
                opportunityId: data.lastAssigned.opportunityId,
              },
            ]
          : [];

        const colaSiguiente: ColaSiguienteItemDto[] = data.nextToAssign
          ? [
              {
                user: data.nextToAssign.user,
                numero: data.nextToAssign.position,
                teamName: getTeamName(data.nextToAssign.user.id),
                haceCuantoNoRecibe: formatHaceCuanto(
                  lastDatesByUser[data.nextToAssign.user.id] ?? null,
                ),
              },
            ]
          : [];

        const colaOrdenadaPorNombre: ColaPorSedeItemDto[] = data.queue.map((item) => {
          const lastAt = lastDatesByUser[item.user.id] ?? null;
          const datosAdicionales: ColaItemDatosAdicionalesDto = {
            lastAssignedAt: formatDateToLima(lastAt),
            haceCuantoNoRecibe: formatHaceCuanto(lastAt),
          };
          return {
            user: item.user,
            numero: item.position,
            teamName: getTeamName(item.user.id),
            isNext: item.isNext,
            isLastAssigned: item.isLastAssigned,
            datosAdicionales,
          };
        });

        campañas.push({
          subCampaignId,
          subCampaignName: SUB_CAMPAIGN_NAMES[subCampaignId] ?? subCampaignId,
          colaUltimoAsignado,
          colaSiguiente,
          colaOrdenadaPorNombre,
        });
      }

      sedes.push({ campusId, campañas });
    }

    return { sedes };
  }

  async getUsersByTeamLeader(userId: string) {
    const teams = await this.getAllTeamsByUser(userId);

    const user = await this.findOne(userId);

    const isOwnerOrTI = teams.some(team => team.team_id === TEAMS_IDS.TEAM_OWNER || team.team_id === TEAMS_IDS.TEAM_TI);
    const isTeamLeaderFiorella = teams.some(team => team.team_id === TEAMS_IDS.TEAM_FIORELLA) && teams.some(team => team.team_id === TEAMS_IDS.TEAM_LEADERS_COMERCIALES);
    const isTeamLeaderVeronica = teams.some(team => team.team_id === TEAMS_IDS.TEAM_VERONICA) && teams.some(team => team.team_id === TEAMS_IDS.TEAM_LEADERS_COMERCIALES);
    const isTeamLeaderMichel = teams.some(team => team.team_id === TEAMS_IDS.TEAM_MICHELL) && teams.some(team => team.team_id === TEAMS_IDS.TEAM_LEADERS_COMERCIALES);
    const isUserApneas = teams.some(team => team.team_id === TEAMS_IDS.EJ_COMERCIAL_APNEA);
    const isUserOi = teams.some(team => team.team_id === TEAMS_IDS.EJ_COMERCIAL_OI);
    const allUsers = await this.getUserByAllTeams([TEAMS_IDS.EJ_COMERCIAL, TEAMS_IDS.EJ_COMERCIAL_OI, TEAMS_IDS.EJ_COMERCIAL_APNEA, TEAMS_IDS.TEAM_FIORELLA, TEAMS_IDS.TEAM_VERONICA, TEAMS_IDS.TEAM_MICHELL]);

    if(isOwnerOrTI || user.type === 'admin') {
      const teamsUsers = [TEAMS_IDS.EJ_COMERCIAL, TEAMS_IDS.EJ_COMERCIAL_OI, TEAMS_IDS.EJ_COMERCIAL_APNEA, TEAMS_IDS.TEAM_FIORELLA, TEAMS_IDS.TEAM_VERONICA, TEAMS_IDS.TEAM_MICHELL];
      const usersByTeam = allUsers.filter(user => teamsUsers.some(team => user.team_id === team));
      return usersByTeam;
    }
    
    if(isTeamLeaderFiorella) {
      const filteredUsers = allUsers.filter(user => user.team_id === TEAMS_IDS.TEAM_FIORELLA);
      // Agregar el usuario actual si no está en la lista
      const userInList = filteredUsers.some(u => u.user_id === userId);
      if (!userInList) {
        const userTeam = teams.find(t => t.team_id === TEAMS_IDS.TEAM_FIORELLA);
        if (userTeam && userTeam.team_name) {
          filteredUsers.push({
            user_id: userId,
            user_name: user.userName || '',
            team_id: TEAMS_IDS.TEAM_FIORELLA,
            team_name: userTeam.team_name
          });
        }
      }
      return filteredUsers;
    }

    if(isTeamLeaderVeronica) {
      const filteredUsers = allUsers.filter(user => user.team_id === TEAMS_IDS.TEAM_VERONICA);
      // Agregar el usuario actual si no está en la lista
      const userInList = filteredUsers.some(u => u.user_id === userId);
      if (!userInList) {
        const userTeam = teams.find(t => t.team_id === TEAMS_IDS.TEAM_VERONICA);
        if (userTeam && userTeam.team_name) {
          filteredUsers.push({
            user_id: userId,
            user_name: user.userName || '',
            team_id: TEAMS_IDS.TEAM_VERONICA,
            team_name: userTeam.team_name
          });
        }
      }
      return filteredUsers;
    }

    if(isTeamLeaderMichel) {
      const filteredUsers = allUsers.filter(user => user.team_id === TEAMS_IDS.TEAM_MICHELL);
      // Agregar el usuario actual si no está en la lista
      const userInList = filteredUsers.some(u => u.user_id === userId);
      if (!userInList) {
        const userTeam = teams.find(t => t.team_id === TEAMS_IDS.TEAM_MICHELL);
        if (userTeam && userTeam.team_name) {
          filteredUsers.push({
            user_id: userId,
            user_name: user.userName || '',
            team_id: TEAMS_IDS.TEAM_MICHELL,
            team_name: userTeam.team_name
          });
        }
      }
      return filteredUsers;
    }
    if(isUserApneas) {
      return allUsers.filter(user => user.team_id === TEAMS_IDS.EJ_COMERCIAL_APNEA);
    }
    if(isUserOi) {
        return allUsers.filter(user => user.team_id === TEAMS_IDS.EJ_COMERCIAL_OI);
    }
    return allUsers.filter(user => user.team_id === TEAMS_IDS.TEAM_LEADERS_COMERCIALES);
  }

  async updateUserCloserToBusy(userId: string, busy: boolean) {
    const user = await this.findOne(userId);
    user.cBusy = busy;
    return await this.userRepository.save(user);
  }

  async switchUserToBusy(userId: string, busy: boolean) {
    const user = await this.findOne(userId);
    user.cOcupado = busy;
    return await this.userRepository.save(user);
  }
}
