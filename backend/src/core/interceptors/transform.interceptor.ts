import {
  StreamableFile,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // File downloads are streamed as-is
        if (data instanceof StreamableFile) return data;
        if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
          return {
            success: data.success,
            data: data.data,
            timestamp: (data as any).timestamp || new Date().toISOString(),
          };
        }
        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}

