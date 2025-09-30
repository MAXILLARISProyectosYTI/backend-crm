import { Controller, Get, Param, Res, NotFoundException, UseGuards, Delete, ParseIntPipe } from '@nestjs/common';
import type { Response } from 'express';
import { FileUploadService } from './file-upload.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly fileUploadService: FileUploadService) {}

  /**
   * Obtiene todos los archivos de una entidad
   */
  @Get('parent/:parentId')
  async getFilesByParent(@Param('parentId') parentId: string) {
    return await this.fileUploadService.getFilesByParent(parentId);
  }

  /**
   * Obtiene la información de un archivo específico
   */
  @Get(':id/info')
  async getFileInfo(@Param('id', ParseIntPipe) id: number) {
    const file = await this.fileUploadService.getFileInfo(id);
    if (!file) {
      throw new NotFoundException('Archivo no encontrado');
    }
    return file;
  }

  /**
   * Descarga un archivo desde la base de datos
   */
  @Get(':id/download')
  async downloadFile(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response
  ) {
    const result = await this.fileUploadService.getFileContent(id);
    
    if (!result.file || !result.content) {
      throw new NotFoundException('Archivo no encontrado');
    }

    // Configurar headers para la descarga
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${result.file.file_name}"`);
    res.setHeader('Content-Length', result.content.length);

    // Enviar el buffer como respuesta
    res.send(result.content);
  }

  /**
   * Visualiza un archivo en el navegador (sin forzar descarga)
   */
  @Get(':id/view')
  async viewFile(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response
  ) {
    const result = await this.fileUploadService.getFileContent(id);
    
    if (!result.file || !result.content) {
      throw new NotFoundException('Archivo no encontrado');
    }

    // Configurar headers para visualización en navegador
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', result.content.length);

    // Enviar el buffer como respuesta
    res.send(result.content);
  }

  /**
   * Elimina un archivo
   */
  @Delete(':id')
  async deleteFile(@Param('id', ParseIntPipe) id: number) {
    return await this.fileUploadService.deleteFile(id);
  }
}
