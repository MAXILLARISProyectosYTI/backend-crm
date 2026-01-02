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
  private readonly BASE_URL = process.env.URL_FILES || '';
  
  private getFileUrl(fileId: number): string {
    // Asegurar que BASE_URL tenga el formato correcto (con / al final si no lo tiene)
    const baseUrl = this.BASE_URL.endsWith('/') ? this.BASE_URL : `${this.BASE_URL}/`;
    return `${baseUrl}files/${fileId}/view`;
  }

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
    let finalMessage = body.message || '';
    
    // Si hay archivos, subirlos primero y construir las URLs
    if (files && files.length > 0) {
      const uploadResult = await this.fileUploadService.uploadFiles(
        files,
        body.targetId,
        body.target_type,
        FileType.ALL,
        DirectoryType.ACTION_HISTORY
      );
      
      // Construir URLs completas para las imágenes
      const imageUrls: string[] = [];
      if (uploadResult.files && uploadResult.files.length > 0) {
        for (const fileResult of uploadResult.files) {
          if (fileResult.id && !fileResult.error) {
            // Construir URL completa usando el método helper
            const fileUrl = this.getFileUrl(fileResult.id);
            imageUrls.push(fileUrl);
          }
        }
      }
      
      // Si hay URLs de imágenes, construir el mensaje con las URLs
      if (imageUrls.length > 0) {
        // Si el mensaje original contiene "Imagen:", reemplazar todo el texto después de "Imagen:" con la URL
        if (finalMessage && finalMessage.toLowerCase().includes('imagen:')) {
          // Extraer cualquier texto antes de "Imagen:" (si hay comentario adicional)
          const beforeImage = finalMessage.substring(0, finalMessage.toLowerCase().indexOf('imagen:')).trim();
          
          // Construir el nuevo mensaje con las URLs completas
          const imageText = imageUrls.map(url => `Imagen: ${url}`).join(', ');
          
          // Si había texto antes de "Imagen:", mantenerlo; si no, solo las URLs
          finalMessage = beforeImage 
            ? `${beforeImage} ${imageText}`
            : imageText;
        } else if (finalMessage && finalMessage.trim().length > 0) {
          // Si hay mensaje original que no menciona imagen, combinarlo con URLs
          const imageText = imageUrls.map(url => `Imagen: ${url}`).join(', ');
          finalMessage = `${finalMessage} ${imageText}`;
        } else {
          // Solo mostrar las URLs de imágenes (sin mensaje original)
          const imageText = imageUrls.map(url => `Imagen: ${url}`).join(', ');
          finalMessage = imageText;
        }
      }
    }
    
    // Guardar action-history con el mensaje que incluye las URLs
    const actionHistory = await this.actionHistoryService.addRecord({
      ...body,
      message: finalMessage
    });

    return actionHistory;
  }
}
