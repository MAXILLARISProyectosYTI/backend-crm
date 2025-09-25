import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './role.entity';
import { RoleUser } from './role-user.entity';
import { RoleTeam } from './role-team.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(RoleUser)
    private readonly roleUserRepository: Repository<RoleUser>,
    @InjectRepository(RoleTeam)
    private readonly roleTeamRepository: Repository<RoleTeam>,
  ) {}

  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    const role = this.roleRepository.create(createRoleDto);
    return await this.roleRepository.save(role);
  }

  async findAll(): Promise<Role[]> {
    return await this.roleRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id },
    });

    if (!role) {
      throw new NotFoundException(`Rol con ID ${id} no encontrado`);
    }

    return role;
  }

  async update(id: string, updateRoleDto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);
    
    // Actualizar campos con los nuevos valores
    Object.assign(role, updateRoleDto);
    
    // Actualizar timestamp de modificación
    role.modifiedAt = new Date();
    
    return await this.roleRepository.save(role);
  }

  async remove(id: string): Promise<void> {
    const result = await this.roleRepository.delete(id);
    
    if (result.affected === 0) {
      throw new NotFoundException(`Rol con ID ${id} no encontrado`);
    }
  }

  // Métodos para gestión de usuarios en roles
  async assignUserToRole(roleId: string, userId: string): Promise<RoleUser> {
    // Verificar que el rol existe
    await this.findOne(roleId);
    
    // Verificar si ya existe la asignación
    const existingAssignment = await this.roleUserRepository.findOne({
      where: { roleId, userId },
    });

    if (existingAssignment) {
      if (existingAssignment.deleted) {
        existingAssignment.deleted = false;
        return await this.roleUserRepository.save(existingAssignment);
      }
      throw new Error('El usuario ya está asignado a este rol');
    }

    const roleUser = this.roleUserRepository.create({
      roleId,
      userId,
      deleted: false,
    });

    return await this.roleUserRepository.save(roleUser);
  }

  async removeUserFromRole(roleId: string, userId: string): Promise<void> {
    const roleUser = await this.roleUserRepository.findOne({
      where: { roleId, userId },
    });

    if (!roleUser) {
      throw new NotFoundException('Asignación de rol no encontrada');
    }

    roleUser.deleted = true;
    await this.roleUserRepository.save(roleUser);
  }

  async getUsersByRole(roleId: string): Promise<string[]> {
    const roleUsers = await this.roleUserRepository.find({
      where: { roleId, deleted: false },
      select: ['userId'],
    });

    return roleUsers.map(ru => ru.userId).filter((id): id is string => Boolean(id));
  }

  async getRolesByUser(userId: string): Promise<string[]> {
    const userRoles = await this.roleUserRepository.find({
      where: { userId, deleted: false },
      select: ['roleId'],
    });

    return userRoles.map(ur => ur.roleId).filter((id): id is string => Boolean(id));
  }

  // Métodos para gestión de equipos en roles
  async assignTeamToRole(roleId: string, teamId: string): Promise<RoleTeam> {
    // Verificar que el rol existe
    await this.findOne(roleId);
    
    // Verificar si ya existe la asignación
    const existingAssignment = await this.roleTeamRepository.findOne({
      where: { roleId, teamId },
    });

    if (existingAssignment) {
      if (existingAssignment.deleted) {
        existingAssignment.deleted = false;
        return await this.roleTeamRepository.save(existingAssignment);
      }
      throw new Error('El equipo ya está asignado a este rol');
    }

    const roleTeam = this.roleTeamRepository.create({
      roleId,
      teamId,
      deleted: false,
    });

    return await this.roleTeamRepository.save(roleTeam);
  }

  async removeTeamFromRole(roleId: string, teamId: string): Promise<void> {
    const roleTeam = await this.roleTeamRepository.findOne({
      where: { roleId, teamId },
    });

    if (!roleTeam) {
      throw new NotFoundException('Asignación de equipo no encontrada');
    }

    roleTeam.deleted = true;
    await this.roleTeamRepository.save(roleTeam);
  }

  async getTeamsByRole(roleId: string): Promise<string[]> {
    const roleTeams = await this.roleTeamRepository.find({
      where: { roleId, deleted: false },
      select: ['teamId'],
    });

    return roleTeams.map(rt => rt.teamId).filter((id): id is string => Boolean(id));
  }

  async getRolesByTeam(teamId: string): Promise<string[]> {
    const teamRoles = await this.roleTeamRepository.find({
      where: { teamId, deleted: false },
      select: ['roleId'],
    });

    return teamRoles.map(tr => tr.roleId).filter((id): id is string => Boolean(id));
  }

  // Métodos adicionales útiles
  async findActiveRoles(): Promise<Role[]> {
    return await this.roleRepository.find({
      where: { deleted: false },
      order: { name: 'ASC' },
    });
  }

  async findByPermission(permissionType: string, permissionValue: string): Promise<Role[]> {
    const query = this.roleRepository.createQueryBuilder('role');
    
    switch (permissionType) {
      case 'assignment':
        query.where('role.assignmentPermission = :value', { value: permissionValue });
        break;
      case 'user':
        query.where('role.userPermission = :value', { value: permissionValue });
        break;
      case 'message':
        query.where('role.messagePermission = :value', { value: permissionValue });
        break;
      case 'portal':
        query.where('role.portalPermission = :value', { value: permissionValue });
        break;
      default:
        throw new Error(`Tipo de permiso no válido: ${permissionType}`);
    }

    return await query.getMany();
  }

  async softDelete(id: string): Promise<Role> {
    const role = await this.findOne(id);
    role.deleted = true;
    role.modifiedAt = new Date();
    return await this.roleRepository.save(role);
  }
}
