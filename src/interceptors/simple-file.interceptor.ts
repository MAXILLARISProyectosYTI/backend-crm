import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

// Interceptor simple para archivos usando FilesInterceptor con memoryStorage
export function createSimpleFileInterceptor(
  fieldName: string = 'files',
  maxCount?: number
) {
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

// Interceptor predefinido para oportunidades
export const OpportunityFilesInterceptor = createSimpleFileInterceptor('files', 10);

// Interceptor predefinido para usuarios
export const UserFilesInterceptor = createSimpleFileInterceptor('files', 5);

// Interceptor predefinido para contactos  
export const ContactFilesInterceptor = createSimpleFileInterceptor('files', 3);
