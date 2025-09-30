import { Controller, Post, Put, Param, Body, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileUploadService } from 'src/files/file-upload.service';
import { OpportunityFilesInterceptor } from 'src/interceptors/simple-file.interceptor';

@Controller('user-files-example')
export class UserFileExampleController {
  constructor(private readonly fileUploadService: FileUploadService) {}

  @Post('upload-avatar/:userId')
  @UseInterceptors(OpportunityFilesInterceptor) // Usar el interceptor existente
  async uploadAvatar(
    @Param('userId') userId: string,
    @UploadedFiles() files: Express.Multer.File[]
  ) {
    // Guardar archivos en la base de datos
    if (files && files.length > 0) {
      await this.fileUploadService.saveFilesToDatabase(
        files,
        userId,
        'user' // Tipo de entidad
      );
    }

    return { message: 'Avatar subido correctamente', files: files.length };
  }

  @Put('update-documents/:userId')
  @UseInterceptors(OpportunityFilesInterceptor)
  async updateDocuments(
    @Param('userId') userId: string,
    @UploadedFiles() files: Express.Multer.File[]
  ) {
    // Guardar archivos en la base de datos
    if (files && files.length > 0) {
      await this.fileUploadService.saveFilesToDatabase(
        files,
        userId,
        'user' // Tipo de entidad
      );
    }

    return { message: 'Documentos actualizados correctamente', files: files.length };
  }

  @Post('get-user-files/:userId')
  async getUserFiles(@Param('userId') userId: string) {
    return await this.fileUploadService.getFilesByParent(userId, 'user');
  }
}
