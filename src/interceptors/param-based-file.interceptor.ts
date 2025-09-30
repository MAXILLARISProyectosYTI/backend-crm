import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

@Injectable()
export class ParamBasedFileInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const parentType = request.params.parentType;
    const directory = request.body.directory || parentType + 's'; // Por defecto usa el parentType + 's'
    
    // Agregar información del directorio a la request para uso posterior
    request.uploadDirectory = directory;

    const interceptor = new (FilesInterceptor('files', 10, {
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
    }))();

    const result = interceptor.intercept(context, next);
    
    // Si es una Promise, la convertimos a Observable
    if (result instanceof Promise) {
      return new Observable(subscriber => {
        result.then(obs => obs.subscribe(subscriber)).catch(err => subscriber.error(err));
      });
    }
    
    return result;
  }
}
