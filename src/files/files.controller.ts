import { Controller, Get, Param, Res, NotFoundException, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { FileUploadService } from './file-upload.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { join } from 'path';
import { existsSync } from 'fs';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly fileUploadService: FileUploadService) {}

  /**
   * Sirve archivos estáticos por tipo de entidad y nombre de archivo
   */
  @Get(':parentType/:fileName')
  async serveFile(
    @Param('parentType') parentType: string,
    @Param('fileName') fileName: string,
    @Res() res: Response
  ) {
    const filePath = join(process.cwd(), 'uploads', `${parentType}s`, fileName);
    
    if (!existsSync(filePath)) {
      throw new NotFoundException('Archivo no encontrado');
    }

    res.sendFile(filePath);
  }

  /**
   * Obtiene todas las imágenes de una entidad específica
   */
  @Get('images/:parentType/:parentId')
  async getImagesByParent(
    @Param('parentType') parentType: string,
    @Param('parentId') parentId: string
  ) {
    return await this.fileUploadService.getImagesByParent(parentId, parentType);
  }

  /**
   * Obtiene todos los archivos de una entidad específica
   */
  @Get('all/:parentType/:parentId')
  async getFilesByParent(
    @Param('parentType') parentType: string,
    @Param('parentId') parentId: string
  ) {
    return await this.fileUploadService.getFilesByParent(parentId, parentType);
  }

  /**
   * Obtiene información de un archivo específico por ID
   */
  @Get('info/:fileId')
  async getFileInfo(@Param('fileId') fileId: string) {
    return await this.fileUploadService.getFileInfo(parseInt(fileId));
  }
}
