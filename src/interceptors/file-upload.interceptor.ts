import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Injectable()
export class FileUploadInterceptor implements NestInterceptor {
  private readonly interceptor: NestInterceptor;

  constructor(
    fields: Array<{ name: string; maxCount?: number }> = [
      { name: 'documents', maxCount: 5 },
      { name: 'images', maxCount: 3 },
      { name: 'attachments', maxCount: 10 }
    ],
    destination: string = './uploads/opportunities'
  ) {
    this.interceptor = new (FileFieldsInterceptor(fields, {
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
    }))();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const result = this.interceptor.intercept(context, next);
    // Si es una Promise, la convertimos a Observable
    if (result instanceof Promise) {
      return new Observable(subscriber => {
        result.then(obs => obs.subscribe(subscriber)).catch(err => subscriber.error(err));
      });
    }
    return result;
  }
}

// Factory function para crear interceptors personalizados
export function createFileUploadInterceptor(
  fields?: Array<{ name: string; maxCount?: number }>,
  destination?: string
) {
  return new FileUploadInterceptor(fields, destination);
}

// Interceptor predefinido para oportunidades
export const OpportunityFileInterceptor = createFileUploadInterceptor([
  { name: 'documents', maxCount: 5 },
  { name: 'images', maxCount: 3 },
  { name: 'attachments', maxCount: 10 }
], './uploads/opportunities');

// Interceptor predefinido para usuarios (por si lo necesitas)
export const UserFileInterceptor = createFileUploadInterceptor([
  { name: 'avatar', maxCount: 1 },
  { name: 'documents', maxCount: 3 }
], './uploads/users');

// Interceptor predefinido para contactos (por si lo necesitas)
export const ContactFileInterceptor = createFileUploadInterceptor([
  { name: 'photo', maxCount: 1 },
  { name: 'attachments', maxCount: 5 }
], './uploads/contacts');
