import { Injectable } from '@nestjs/common';
import { FilesService } from './files.service';
import { FileType, DirectoryType } from './dto/files.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

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
    const fullDestination = join(basePath, destination);
    
    // Crear directorio si no existe
    if (!existsSync(fullDestination)) {
      mkdirSync(fullDestination, { recursive: true });
    }

    return FilesInterceptor(fieldName, maxCount, {
      storage: diskStorage({
        destination: fullDestination,
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;
          callback(null, filename);
        },
      }),
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
        // Crear registro en la base de datos
        const fileRecord = await this.filesService.createFileRecord(
          parentId,
          parentType,
          file.filename
        );

        results.push({
          id: fileRecord.id,
          fileName: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: file.path,
          parentId,
          parentType,
          createdAt: fileRecord.created_at
        });
      } catch (error) {
        console.error(`Error al guardar archivo ${file.filename}:`, error);
        results.push({
          error: `Error al guardar archivo ${file.filename}`,
          fileName: file.filename
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
   * Elimina un archivo
   */
  async deleteFile(fileId: number) {
    const file = await this.filesService.findOne(fileId);
    if (!file) {
      throw new Error('Archivo no encontrado');
    }

    // Eliminar archivo físico (opcional)
    // const filePath = join('./uploads', file.parent_type, file.file_name);
    // if (existsSync(filePath)) {
    //   unlinkSync(filePath);
    // }

    // Eliminar registro de la base de datos
    await this.filesService.delete(fileId);
    
    return { message: 'Archivo eliminado correctamente' };
  }
}
