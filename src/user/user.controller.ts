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
import { UserService, UserWithRoles } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserWithAssignmentsDto } from './dto/user-with-assignments.dto';
import { CurrentUserAssignmentsDto } from './dto/current-user-assignments.dto';
import { User } from './user.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Public } from 'src/auth/decorators/public.decorator';
import { TEAMS_IDS } from 'src/globals/ids';
import { orderListAlphabetic } from './utils/orderListAlphabetic';

@UseGuards(JwtAuthGuard)
@Controller('user')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('users-by-team-leader/:id')
  async getUsersByTeamLeader(@Param('id') id: string) {
    return await this.userService.getUsersByTeamLeader(id);
  }

  @Get('commercial')
  async getUsersCommercial() {
    
    const teams = [
      TEAMS_IDS.EJ_COMERCIAL,
      TEAMS_IDS.TEAM_FIORELLA,
      TEAMS_IDS.TEAM_VERONICA,
      TEAMS_IDS.TEAM_MICHELL,
      TEAMS_IDS.EJ_COMERCIAL_OI,
      TEAMS_IDS.EJ_COMERCIAL_APNEA,
    ]

    const users = await this.userService.getUserByAllTeams(teams)

    const usersEntity = users.map(user => this.userService.findOne(user.user_id))

    return orderListAlphabetic(await Promise.all(usersEntity))
  }

  @Get('users-active')
  async usersActive() {
    return await this.userService.getUsersCommercials();
  }

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
  async findByUserName(@Param('userName') userName: string): Promise<UserWithRoles> {
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
