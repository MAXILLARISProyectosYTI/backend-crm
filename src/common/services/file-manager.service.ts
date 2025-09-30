import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export enum FileType {
  IMAGE = 'image',
  PDF = 'pdf',
}

export enum DirectoryType {
  OPPORTUNITIES = 'opportunities',
  CONTACTS = 'contacts',
  USERS = 'users',
  MEETINGS = 'meetings',
}

export interface FileUploadOptions {
  file?: Express.Multer.File;
  url?: string;
  fileType: FileType;
  directory: DirectoryType;
  customFileName?: string;
  entityId?: string; // ID de la entidad para organizar archivos
}

export interface FileUploadResult {
  fileName: string;
  filePath: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
}

@Injectable()
export class FileManagerService {
  
  /**
   * Maneja la carga de archivos desde File object o URL
   * @param options Opciones de carga del archivo
   * @returns Información del archivo guardado
   */
  async uploadFile(options: FileUploadOptions): Promise<FileUploadResult> {
    const { file, url, fileType, directory, customFileName, entityId } = options;

    if (!file && !url) {
      throw new BadRequestException('Debe proporcionar un archivo o una URL');
    }

    if (file && url) {
      throw new BadRequestException('No puede proporcionar tanto un archivo como una URL');
    }

    // Crear directorio si no existe
    const uploadDir = this.createUploadDirectory(directory, entityId);

    if (file) {
      return this.handleFileUpload(file, uploadDir, fileType, customFileName);
    } else if (url) {
      return this.handleUrlDownload(url, uploadDir, fileType, customFileName);
    }

    throw new BadRequestException('Error inesperado en la carga del archivo');
  }

  /**
   * Crea el directorio de uploads si no existe
   * @param directory Tipo de directorio
   * @param entityId ID de la entidad (opcional)
   * @returns Ruta del directorio
   */
  private createUploadDirectory(directory: DirectoryType, entityId?: string): string {
    const baseDir = path.join(process.cwd(), 'uploads', directory);
    
    if (entityId) {
      const entityDir = path.join(baseDir, entityId);
      if (!fs.existsSync(entityDir)) {
        fs.mkdirSync(entityDir, { recursive: true });
      }
      return entityDir;
    }

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    return baseDir;
  }

  /**
   * Maneja la carga de archivos desde Express.Multer.File
   * @param file Archivo de Multer
   * @param uploadDir Directorio de destino
   * @param fileType Tipo de archivo esperado
   * @param customFileName Nombre personalizado (opcional)
   * @returns Información del archivo guardado
   */
  private async handleFileUpload(
    file: Express.Multer.File,
    uploadDir: string,
    fileType: FileType,
    customFileName?: string,
  ): Promise<FileUploadResult> {
    try {
      // Validar tipo de archivo
      this.validateFileType(file.mimetype, fileType);

      // Generar nombre del archivo
      const fileName = customFileName || this.generateFileName(file.originalname, fileType);
      const filePath = path.join(uploadDir, fileName);

      // Guardar archivo
      fs.writeFileSync(filePath, file.buffer);

      console.log(`Archivo guardado exitosamente: ${filePath}`);

      return {
        fileName,
        filePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      };

    } catch (error) {
      console.error('Error al guardar archivo:', error);
      throw new BadRequestException(`No se pudo guardar el archivo: ${error.message}`);
    }
  }

  /**
   * Maneja la descarga de archivos desde URL
   * @param url URL del archivo
   * @param uploadDir Directorio de destino
   * @param fileType Tipo de archivo esperado
   * @param customFileName Nombre personalizado (opcional)
   * @returns Información del archivo guardado
   */
  private async handleUrlDownload(
    url: string,
    uploadDir: string,
    fileType: FileType,
    customFileName?: string,
  ): Promise<FileUploadResult> {
    try {
      // Descargar archivo
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000, // 30 segundos timeout
      });

      // Obtener información del archivo desde headers
      const contentType = response.headers['content-type'] || '';
      const contentLength = parseInt(response.headers['content-length'] || '0');
      const originalUrl = new URL(url);
      const urlFileName = path.basename(originalUrl.pathname) || 'archivo';

      // Validar tipo de archivo
      this.validateFileType(contentType, fileType);

      // Generar nombre del archivo
      const fileName = customFileName || this.generateFileName(urlFileName, fileType);
      const filePath = path.join(uploadDir, fileName);

      // Guardar archivo
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`Archivo descargado exitosamente: ${filePath}`);
          resolve({
            fileName,
            filePath,
            originalName: urlFileName,
            mimeType: contentType,
            size: contentLength,
          });
        });
        writer.on('error', (error) => {
          console.error('Error al guardar archivo descargado:', error);
          reject(error);
        });
      });

    } catch (error) {
      console.error(`Error al descargar archivo desde ${url}:`, error);
      throw new BadRequestException(`No se pudo descargar el archivo: ${error.message}`);
    }
  }

  /**
   * Valida que el tipo de archivo coincida con el tipo esperado
   * @param mimeType Tipo MIME del archivo
   * @param expectedType Tipo esperado
   */
  private validateFileType(mimeType: string, expectedType: FileType): void {
    const validMimeTypes = {
      [FileType.IMAGE]: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
      [FileType.PDF]: ['application/pdf'],
    };

    const allowedTypes = validMimeTypes[expectedType];
    
    if (!allowedTypes.includes(mimeType.toLowerCase())) {
      throw new BadRequestException(
        `Tipo de archivo no válido. Esperado: ${expectedType}, Recibido: ${mimeType}`
      );
    }
  }

  /**
   * Genera un nombre único para el archivo
   * @param originalName Nombre original del archivo
   * @param fileType Tipo de archivo
   * @returns Nombre único del archivo
   */
  private generateFileName(originalName: string, fileType: FileType): string {
    const timestamp = Date.now();
    const randomNumber = Math.floor(Math.random() * 1000000000);
    
    // Determinar extensión basada en el tipo
    let extension = '';
    switch (fileType) {
      case FileType.PDF:
        extension = '.pdf';
        break;
      case FileType.IMAGE:
        // Intentar obtener extensión del nombre original
        const originalExt = path.extname(originalName).toLowerCase();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        extension = imageExtensions.includes(originalExt) ? originalExt : '.jpg';
        break;
    }

    return `files-${timestamp}-${randomNumber}${extension}`;
  }

  /**
   * Elimina un archivo del sistema
   * @param filePath Ruta completa del archivo
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Archivo eliminado: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error al eliminar archivo ${filePath}:`, error);
      throw new BadRequestException(`No se pudo eliminar el archivo: ${error.message}`);
    }
  }

  /**
   * Verifica si un archivo existe
   * @param filePath Ruta del archivo
   * @returns True si el archivo existe
   */
  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * Obtiene información de un archivo
   * @param filePath Ruta del archivo
   * @returns Información del archivo o null si no existe
   */
  getFileInfo(filePath: string): { size: number; mtime: Date } | null {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return {
          size: stats.size,
          mtime: stats.mtime,
        };
      }
      return null;
    } catch (error) {
      console.error(`Error al obtener información del archivo ${filePath}:`, error);
      return null;
    }
  }
}
