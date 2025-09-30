import { Injectable } from '@nestjs/common';
import { FilesService } from './files.service';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { FilesInterceptor } from '@nestjs/platform-express';

@Injectable()
export class FileUploadService {
  constructor(private readonly filesService: FilesService) {}

  /**
   * Crea un interceptor de archivos para un tipo específico de entidad
   */
  createFileInterceptor(
    parentType: string,
    fieldName: string = 'files',
    maxCount: number = 10,
    destination: string = './uploads'
  ) {
    return FilesInterceptor(fieldName, maxCount, {
      storage: diskStorage({
        destination,
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
   * Guarda los archivos subidos en la base de datos
   */
  async saveFilesToDatabase(
    files: Express.Multer.File[],
    parentId: string,
    parentType: string
  ): Promise<void> {
    if (!files || files.length === 0) {
      return;
    }

    for (const file of files) {
      try {
        await this.filesService.createFileRecord(
          parentId,
          parentType,
          file.filename
        );
        console.log(`Archivo guardado: ${file.filename} para ${parentType}:${parentId}`);
      } catch (error) {
        console.error(`Error al guardar archivo ${file.filename}:`, error);
        throw error;
      }
    }
  }

  /**
   * Obtiene todos los archivos de una entidad específica
   */
  async getFilesByParent(parentId: string, parentType: string) {
    return await this.filesService.findByParentId(parentId);
  }

  /**
   * Obtiene todas las imágenes de una entidad específica con información completa
   */
  async getImagesByParent(parentId: string, parentType: string) {
    const files = await this.filesService.findByParentId(parentId);
    
    // Filtrar solo imágenes
    const imageFiles = files.filter(file => {
      const extension = file.file_name.split('.').pop()?.toLowerCase();
      return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '');
    });

    // Agregar información adicional para el frontend
    return imageFiles.map(file => ({
      id: file.id,
      fileName: file.file_name,
      originalName: file.file_name, // Podrías guardar el nombre original en la BD
      parentId: file.parent_id,
      parentType: file.parent_type,
      createdAt: file.created_at,
      url: this.getFileUrl(file.file_name, parentType),
      path: this.getFilePath(file.file_name, parentType)
    }));
  }

  /**
   * Obtiene la URL pública del archivo
   */
  private getFileUrl(fileName: string, parentType: string): string {
    const baseUrl = process.env.API_URL || 'http://localhost:3000';
    return `${baseUrl}/files/${parentType}/${fileName}`;
  }

  /**
   * Obtiene la ruta física del archivo
   */
  private getFilePath(fileName: string, parentType: string): string {
    return `./uploads/${parentType}s/${fileName}`;
  }

  /**
   * Verifica si un archivo existe físicamente
   */
  async fileExists(fileName: string, parentType: string): Promise<boolean> {
    const fs = require('fs').promises;
    const path = this.getFilePath(fileName, parentType);
    
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtiene información de un archivo específico
   */
  async getFileInfo(fileId: number) {
    const file = await this.filesService.findOne(fileId);
    if (!file) {
      throw new Error('Archivo no encontrado');
    }

    const exists = await this.fileExists(file.file_name, file.parent_type);
    
    return {
      id: file.id,
      fileName: file.file_name,
      parentId: file.parent_id,
      parentType: file.parent_type,
      createdAt: file.created_at,
      url: this.getFileUrl(file.file_name, file.parent_type),
      path: this.getFilePath(file.file_name, file.parent_type),
      exists
    };
  }

  /**
   * Elimina un archivo de la base de datos
   */
  async deleteFileRecord(fileId: number): Promise<void> {
    // Aquí podrías implementar la lógica para eliminar el archivo físico también
    // await this.filesService.delete(fileId);
  }
}
