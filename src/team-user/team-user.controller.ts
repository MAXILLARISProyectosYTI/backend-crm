import { Controller } from '@nestjs/common';
import { TeamUserService } from './team-user.service';

@Controller('team-user')
export class TeamUserController {
  constructor(private readonly teamUserService: TeamUserService) {}
}
