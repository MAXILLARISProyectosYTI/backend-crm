import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ActionHistoryService } from './action-history.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ActionHistory } from './action-history.entity';
import { CreateActionDto } from './dto/create-action.dto';

@UseGuards(JwtAuthGuard)
@Controller('action-history')
export class ActionHistoryController {
  constructor(private readonly actionHistoryService: ActionHistoryService) {}

  @Post('record')
  async addRecord(@Body() actionHistory: CreateActionDto): Promise<ActionHistory> {
    return await this.actionHistoryService.addRecord(actionHistory);
  }
}
