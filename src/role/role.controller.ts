import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './role.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('role')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createRoleDto: CreateRoleDto): Promise<Role> {
    return await this.roleService.create(createRoleDto);
  }

  @Get()
  async findAll(): Promise<Role[]> {
    return await this.roleService.findAll();
  }

  @Get('active')
  async findActive(): Promise<Role[]> {
    return await this.roleService.findActiveRoles();
  }

  @Get('permission/:permissionType/:permissionValue')
  async findByPermission(
    @Param('permissionType') permissionType: string,
    @Param('permissionValue') permissionValue: string,
  ): Promise<Role[]> {
    return await this.roleService.findByPermission(permissionType, permissionValue);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Role> {
    return await this.roleService.findOne(id);
  }

  @Get(':id/users')
  async getUsersByRole(@Param('id') id: string): Promise<string[]> {
    return await this.roleService.getUsersByRole(id);
  }

  @Get(':id/teams')
  async getTeamsByRole(@Param('id') id: string): Promise<string[]> {
    return await this.roleService.getTeamsByRole(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ): Promise<Role> {
    return await this.roleService.update(id, updateRoleDto);
  }

  @Patch(':id/soft-delete')
  async softDelete(@Param('id') id: string): Promise<Role> {
    return await this.roleService.softDelete(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return await this.roleService.remove(id);
  }

  // Endpoints para gestión de usuarios en roles
  @Post(':id/users/:userId')
  async assignUserToRole(
    @Param('id') roleId: string,
    @Param('userId') userId: string,
  ) {
    return await this.roleService.assignUserToRole(roleId, userId);
  }

  @Delete(':id/users/:userId')
  async removeUserFromRole(
    @Param('id') roleId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return await this.roleService.removeUserFromRole(roleId, userId);
  }

  // Endpoints para gestión de equipos en roles
  @Post(':id/teams/:teamId')
  async assignTeamToRole(
    @Param('id') roleId: string,
    @Param('teamId') teamId: string,
  ) {
    return await this.roleService.assignTeamToRole(roleId, teamId);
  }

  @Delete(':id/teams/:teamId')
  async removeTeamFromRole(
    @Param('id') roleId: string,
    @Param('teamId') teamId: string,
  ): Promise<void> {
    return await this.roleService.removeTeamFromRole(roleId, teamId);
  }
}

// Controlador adicional para consultas de usuario-rol
@Controller('user-role')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class UserRoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get('user/:userId/roles')
  async getRolesByUser(@Param('userId') userId: string): Promise<string[]> {
    return await this.roleService.getRolesByUser(userId);
  }

  @Get('team/:teamId/roles')
  async getRolesByTeam(@Param('teamId') teamId: string): Promise<string[]> {
    return await this.roleService.getRolesByTeam(teamId);
  }
}
