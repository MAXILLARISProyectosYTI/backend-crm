import { Body, Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ActionHistoryService } from './action-history.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ActionHistory } from './action-history.entity';
import { CreateActionDto } from './dto/create-action.dto';
import { OpportunityFilesInterceptor } from 'src/interceptors/simple-file.interceptor';
import { FileUploadService } from 'src/files/file-upload.service';
import { FileType, DirectoryType } from 'src/files/dto/files.dto';

@UseGuards(JwtAuthGuard)
@Controller('action-history')
export class ActionHistoryController {
  constructor(
    private readonly actionHistoryService: ActionHistoryService,
    private readonly fileUploadService: FileUploadService
  ) {}

  @Post('record')
  @UseInterceptors(OpportunityFilesInterceptor)
  async addRecord(
    @Body() body: Omit<CreateActionDto, 'files'>,
    @UploadedFiles() files: Express.Multer.File[]
  ): Promise<ActionHistory> {
    const actionHistory = await this.actionHistoryService.addRecord(body, files);
    
    // Guardar archivos en la base de datos
    if (files && files.length > 0) {
      await this.fileUploadService.uploadFiles(
        files,
        body.targetId,
        body.target_type,
        FileType.ALL,
        DirectoryType.ACTION_HISTORY
      );
    }

    return actionHistory;
  }
}
