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
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserWithAssignmentsDto } from './dto/user-with-assignments.dto';
import { CurrentUserAssignmentsDto } from './dto/current-user-assignments.dto';
import { User } from './user.entity';

@Controller('user')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return await this.userService.create(createUserDto);
  }

  @Get()
  async findAll(): Promise<User[]> {
    return await this.userService.findAll();
  }

  @Get('active')
  async findActive(): Promise<User[]> {
    return await this.userService.findActiveUsers();
  }

  @Get('with-opportunities')
  async getUsersWithOpportunities(): Promise<User[]> {
    return await this.userService.getUsersWithOpportunities();
  }

  @Get('current/:id/assignments')
  async getCurrentUserAssignments(@Param('id') id: string): Promise<CurrentUserAssignmentsDto> {
    return await this.userService.getCurrentUserAssignments(id);
  }

  @Get(':id/assignments')
  async getUserWithAssignments(@Param('id') id: string): Promise<UserWithAssignmentsDto> {
    return await this.userService.getUserWithAssignments(id);
  }

  @Get('type/:type')
  async findByType(@Param('type') type: string): Promise<User[]> {
    return await this.userService.findByType(type);
  }

  @Get('team/:teamId')
  async findByTeam(@Param('teamId') teamId: string): Promise<User[]> {
    return await this.userService.findByTeam(teamId);
  }

  @Get('contact/:contactId')
  async findUsersByContact(@Param('contactId') contactId: string): Promise<User[]> {
    return await this.userService.findUsersByContact(contactId);
  }

  @Get('username/:userName')
  async findByUserName(@Param('userName') userName: string): Promise<User> {
    return await this.userService.findByUserName(userName);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<User> {
    return await this.userService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return await this.userService.update(id, updateUserDto);
  }

  @Patch(':id/activate')
  async activateUser(@Param('id') id: string): Promise<User> {
    return await this.userService.activateUser(id);
  }

  @Patch(':id/deactivate')
  async deactivateUser(@Param('id') id: string): Promise<User> {
    return await this.userService.deactivateUser(id);
  }

  @Patch(':id/soft-delete')
  async softDelete(@Param('id') id: string): Promise<User> {
    return await this.userService.softDelete(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return await this.userService.remove(id);
  }
}
