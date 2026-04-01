import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from 'src/user/user.service';

/**
 * Solo usuarios CRM con user.type === 'admin' (tabla user).
 * Requiere JwtAuthGuard previo (req.user.userId).
 */
@Injectable()
export class AdminUserGuard implements CanActivate {
  constructor(private readonly userService: UserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: { userId?: string } }>();
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('No autenticado');
    }
    try {
      const ok = await this.userService.isAdmin(userId);
      if (!ok) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
