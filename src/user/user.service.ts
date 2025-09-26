import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserWithAssignmentsDto } from './dto/user-with-assignments.dto';
import { CurrentUserAssignmentsDto } from './dto/current-user-assignments.dto';
import { Opportunity } from '../opportunity/opportunity.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
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
}
