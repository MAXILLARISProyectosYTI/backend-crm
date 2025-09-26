import { BadRequestException, Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
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
import { CAMPAIGNS_IDS, TEAMS_IDS } from './lib/ids';
import { OpportunityService } from 'src/opportunity/opportunity.service';
import { getNextUser } from './utils/getNextUser';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @Inject(forwardRef(() => OpportunityService))
    private readonly opportunityService: OpportunityService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(createUserDto);
    return await this.userRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return await this.userRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    
    // Actualizar campos con los nuevos valores
    Object.assign(user, updateUserDto);
    
    // Actualizar timestamp de modificación
    user.modifiedAt = new Date();
    
    return await this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const result = await this.userRepository.delete(id);
    
    if (result.affected === 0) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
  }

  // Métodos adicionales útiles
  async findByUserName(userName: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { userName },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con nombre de usuario ${userName} no encontrado`);
    }

    return user;
  }

  async findActiveUsers(): Promise<User[]> {
    return await this.userRepository.find({
      where: { isActive: true },
      order: { firstName: 'ASC', lastName: 'ASC' },
    });
  }

  async findByType(type: string): Promise<User[]> {
    return await this.userRepository.find({
      where: { type },
      order: { createdAt: 'DESC' },
    });
  }

  async findByTeam(teamId: string): Promise<User[]> {
    return await this.userRepository.find({
      where: { defaultTeamId: teamId },
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
      where: { assignedUserId: userId, deleted: false },
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
        acc[opp.assignedUserId] = (acc[opp.assignedUserId] || 0) + 1;
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
      where: { assignedUserId: userId, deleted: false },
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
        acc[opp.assignedUserId] = (acc[opp.assignedUserId] || 0) + 1;
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
    const users = await this.userRepository.createQueryBuilder('tu')
    .leftJoin('user', 'u', 'u.id = tu.user_id')
    .leftJoin('team', 't', 't.id = tu.team_id')
    .select([
      'u.id AS user_id',
      'u.user_name AS user_name', 
      't.name AS team_name'
    ])
    .where('t.id IN (:...teamIds)', { teamIds: teams })
    .getRawMany();
    return users
  }

  async getUsersBySubCampaignId(subCampaignId: string): Promise<User[]> {
    const usersActives = await this.findActiveUsers()

    if(usersActives.length === 0){
      console.log('No hay usuarios activos, asignando por defecto')
      return []
    }

    const teams = getTeamsBySubCampaing(subCampaignId)
    
    if(teams.length === 0){
      throw new BadRequestException('No hay equipos asignados a esta subcampaña')
    }

    const usersByAllTeams = await this.getUserByAllTeams(teams)

    // Filtrar usuarios que estén tanto en usersActives como en usersByAllTeams basándose en user.id
    const teamUserIds = usersByAllTeams.map(teamUser => teamUser.user_id)
    
    // Obtener usuarios activos que también estén en los equipos
    const filteredUsers = usersActives.filter(user => 
      teamUserIds.includes(user.id)
    )

    return orderListAlphabetic(filteredUsers)
  }

  async getNextUserToAssign(subCampaignId: string): Promise<User> {
    const listUsers = await this.getUsersBySubCampaignId(subCampaignId)
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

      const userSelected = listUsersDefault[Math.floor(Math.random() * listUsersDefault.length)];
      return await this.findOne(userSelected.user_id)
    }

    const lastOpportunityAssigned = await this.opportunityService.getLastOpportunityAssigned(subCampaignId)

    const nextUser = getNextUser(listUsers, lastOpportunityAssigned)

    if(!nextUser){
      throw new BadRequestException('No se encontro el siguiente usuario a asignar')
    }

    return nextUser
  }
}
