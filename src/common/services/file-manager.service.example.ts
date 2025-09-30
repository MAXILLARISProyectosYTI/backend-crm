/**
 * EJEMPLOS DE USO DEL FILE MANAGER SERVICE
 * 
 * Este archivo contiene ejemplos de cómo usar el FileManagerService
 * en diferentes escenarios. NO es parte del código de producción.
 */

import { FileManagerService, FileType, DirectoryType, FileUploadResult } from './file-manager.service';

export class FileManagerExamples {
  constructor(private readonly fileManagerService: FileManagerService) {}

  /**
   * Ejemplo 1: Subir archivo PDF desde URL a oportunidades
   */
  async uploadPdfFromUrlToOpportunity() {
    const result = await this.fileManagerService.uploadFile({
      url: 'https://example.com/documento.pdf',
      fileType: FileType.PDF,
      directory: DirectoryType.OPPORTUNITIES,
      entityId: 'opportunity_123',
      customFileName: 'factura_comprobante.pdf',
    });

    console.log('Archivo guardado:', result.filePath);
    // Resultado: uploads/opportunities/opportunity_123/factura_comprobante.pdf
  }

  /**
   * Ejemplo 2: Subir imagen desde File object a contactos
   */
  async uploadImageFromFileToContact(file: Express.Multer.File) {
    const result = await this.fileManagerService.uploadFile({
      file: file,
      fileType: FileType.IMAGE,
      directory: DirectoryType.CONTACTS,
      entityId: 'contact_456',
    });

    console.log('Imagen guardada:', result.filePath);
    // Resultado: uploads/contacts/contact_456/files-1234567890-123456789.jpg
  }

  /**
   * Ejemplo 3: Subir PDF desde URL a usuarios (sin entityId)
   */
  async uploadPdfFromUrlToUsers() {
    const result = await this.fileManagerService.uploadFile({
      url: 'https://example.com/curriculum.pdf',
      fileType: FileType.PDF,
      directory: DirectoryType.USERS,
      customFileName: 'curriculum_juan_perez.pdf',
    });

    console.log('PDF guardado:', result.filePath);
    // Resultado: uploads/users/curriculum_juan_perez.pdf
  }

  /**
   * Ejemplo 4: Subir imagen desde File object a reuniones
   */
  async uploadImageFromFileToMeeting(file: Express.Multer.File) {
    const result = await this.fileManagerService.uploadFile({
      file: file,
      fileType: FileType.IMAGE,
      directory: DirectoryType.MEETINGS,
      entityId: 'meeting_789',
      customFileName: 'evidencia_reunion.png',
    });

    console.log('Imagen de reunión guardada:', result.filePath);
    // Resultado: uploads/meetings/meeting_789/evidencia_reunion.png
  }

  /**
   * Ejemplo 5: Manejar múltiples archivos
   */
  async uploadMultipleFiles(files: Express.Multer.File[], opportunityId: string) {
    const results: FileUploadResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Determinar tipo de archivo basado en MIME type
      const fileType = file.mimetype.startsWith('image/') 
        ? FileType.IMAGE 
        : FileType.PDF;

      const result = await this.fileManagerService.uploadFile({
        file: file,
        fileType: fileType,
        directory: DirectoryType.OPPORTUNITIES,
        entityId: opportunityId,
        customFileName: `documento_${i + 1}.${fileType === FileType.IMAGE ? 'jpg' : 'pdf'}`,
      });

      results.push(result);
    }

    return results;
  }

  /**
   * Ejemplo 6: Verificar y eliminar archivos
   */
  async manageFileLifecycle(filePath: string) {
    // Verificar si el archivo existe
    const exists = this.fileManagerService.fileExists(filePath);
    console.log('Archivo existe:', exists);

    if (exists) {
      // Obtener información del archivo
      const info = this.fileManagerService.getFileInfo(filePath);
      console.log('Información del archivo:', info);

      // Eliminar el archivo
      await this.fileManagerService.deleteFile(filePath);
      console.log('Archivo eliminado');
    }
  }
}

/**
 * ESTRUCTURA DE DIRECTORIOS GENERADA:
 * 
 * uploads/
 * ├── opportunities/
 * │   ├── opportunity_123/
 * │   │   ├── comprobante_soles_opportunity_123.pdf
 * │   │   └── comprobante_dolares_opportunity_123.pdf
 * │   └── opportunity_456/
 * │       └── documento_1.pdf
 * ├── contacts/
 * │   └── contact_456/
 * │       └── files-1234567890-123456789.jpg
 * ├── users/
 * │   └── curriculum_juan_perez.pdf
 * └── meetings/
 *     └── meeting_789/
 *         └── evidencia_reunion.png
 */
