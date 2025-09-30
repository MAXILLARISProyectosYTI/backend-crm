import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DateTime } from 'luxon';

@Injectable()
export class DateTimezoneInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => this.transformDates(data)),
    );
  }

  private transformDates(obj: any): any {
    if (obj instanceof Date) {
      return DateTime.fromJSDate(obj, { zone: 'utc' })
        .setZone('America/Lima')
        .toFormat('yyyy-MM-dd HH:mm:ss');
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.transformDates(item));
    }

    if (obj !== null && typeof obj === 'object') {
      const newObj: any = {};
      for (const key of Object.keys(obj)) {
        newObj[key] = this.transformDates(obj[key]);
      }
      return newObj;
    }

    return obj;
  }
}
