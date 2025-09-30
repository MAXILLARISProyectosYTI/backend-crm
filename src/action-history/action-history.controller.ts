import { Body, Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ActionHistoryService } from './action-history.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ActionHistory } from './action-history.entity';
import { CreateActionDto } from './dto/create-action.dto';
import { OpportunityFilesInterceptor } from 'src/interceptors/simple-file.interceptor';

@UseGuards(JwtAuthGuard)
@Controller('action-history')
export class ActionHistoryController {
  constructor(private readonly actionHistoryService: ActionHistoryService) {}

  @Post('record')
  @UseInterceptors(OpportunityFilesInterceptor)
  async addRecord(
    @Body() body: Omit<CreateActionDto, 'files'>,
    @UploadedFiles() files: Express.Multer.File[]
  ): Promise<ActionHistory> {
    return await this.actionHistoryService.addRecord(body, files);
  }
}
