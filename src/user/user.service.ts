import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
}
