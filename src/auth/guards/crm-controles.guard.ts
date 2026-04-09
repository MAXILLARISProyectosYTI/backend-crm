import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { ROLES_IDS } from 'src/globals/ids';

/**
 * Permite acceso a usuarios CRM con type === 'admin'
 * O usuarios regulares que tengan el rol "Controles".
 * Requiere JwtAuthGuard previo (req.user.userId).
 */
@Injectable()
export class CrmControlesGuard implements CanActivate {
  constructor(private readonly userService: UserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: { userId?: string } }>();
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('No autenticado');
    }

    try {
      const isAdmin = await this.userService.isAdmin(userId);
      if (isAdmin) return true;

      const hasControlesRole = await this.userService.hasRole(
        userId,
        ROLES_IDS.CONTROLES,
      );
      return hasControlesRole;
    } catch {
      return false;
    }
  }
}
