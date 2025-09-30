import { Injectable } from '@nestjs/common';
import { FilesService } from './files.service';
import { FileType, DirectoryType } from './dto/files.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

@Injectable()
export class FileUploadService {
  constructor(private readonly filesService: FilesService) {}

  /**
   * Crea un interceptor de archivos con configuración dinámica
   */
  createFileInterceptor(
    fieldName: string = 'files',
    destination: string = 'opportunities',
    maxCount: number = 10,
    basePath: string = './uploads'
  ) {
    // Usar memoryStorage para mantener el buffer en memoria
    return FilesInterceptor(fieldName, maxCount, {
      storage: memoryStorage(),
      fileFilter: (req, file, callback) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|xlsx|xls/;
        const fileExtension = allowedTypes.test(extname(file.originalname).toLowerCase());
        const mimeType = allowedTypes.test(file.mimetype);
        
        if (mimeType && fileExtension) {
          return callback(null, true);
        } else {
          callback(new Error('Tipo de archivo no permitido'), false);
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB límite por archivo
      },
    });
  }

  /**
   * Genera un nombre de archivo único
   */
  private generateUniqueFileName(originalName: string): string {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(originalName);
    return `file-${uniqueSuffix}${ext}`;
  }

  /**
   * Sube archivos y los guarda en la base de datos
   */
  async uploadFiles(
    files: Express.Multer.File[],
    parentId: string,
    parentType: string,
    fileType: FileType = FileType.ALL,
    directory: DirectoryType = DirectoryType.OPPORTUNITIES
  ) {
    const results: any[] = [];

    for (const file of files) {
      try {
        // Generar nombre único para el archivo
        const fileName = this.generateUniqueFileName(file.originalname);
        
        // Crear registro en la base de datos con el contenido del archivo (buffer)
        const fileRecord = await this.filesService.createFileRecord(
          parentId,
          parentType,
          fileName,
          file.buffer
        );

        results.push({
          id: fileRecord.id,
          fileName: fileName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          parentId,
          parentType,
          createdAt: fileRecord.created_at
        });
      } catch (error) {
        console.error(`Error al guardar archivo ${file.originalname}:`, error);
        results.push({
          error: `Error al guardar archivo ${file.originalname}`,
          fileName: file.originalname
        });
      }
    }

    return {
      message: `${results.length} archivo(s) procesado(s)`,
      files: results
    };
  }

  /**
   * Obtiene todas las imágenes de una entidad específica
   */
  async getImagesByParent(parentId: string, parentType: string) {
    const files = await this.filesService.findByParentId(parentId);
    return files.filter(file => 
      file.file_name.match(/\.(jpg|jpeg|png|gif)$/i)
    );
  }

  /**
   * Obtiene todos los archivos de una entidad específica
   */
  async getFilesByParent(parentId: string) {
    return await this.filesService.findByParentId(parentId);
  }

  /**
   * Obtiene información de un archivo específico por ID
   */
  async getFileInfo(fileId: number) {
    return await this.filesService.findOne(fileId);
  }

  /**
   * Elimina un archivo de la base de datos
   */
  async deleteFile(fileId: number) {
    const file = await this.filesService.findOne(fileId);
    if (!file) {
      throw new Error('Archivo no encontrado');
    }

    // Eliminar registro de la base de datos
    await this.filesService.delete(fileId);
    
    return { message: 'Archivo eliminado correctamente' };
  }

  /**
   * Obtiene el contenido de un archivo directamente desde la base de datos
   */
  async getFileContent(fileId: number) {
    const result = await this.filesService.getFileContent(fileId);
    if (!result.file) {
      throw new Error('Archivo no encontrado');
    }
    
    return {
      file: result.file,
      content: result.content,
      hasContent: !!result.content
    };
  }
}
