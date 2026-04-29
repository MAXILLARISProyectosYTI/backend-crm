import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { ROLES_IDS } from 'src/globals/ids';

const CONTROLES_ROLE_IDS = [
  ROLES_IDS.CONTROLES,
  ROLES_IDS.CONTROLES_LIMA,
  ROLES_IDS.CONTROLES_AREQUIPA,
];

/**
 * Permite acceso a usuarios CRM con type === 'admin'
 * O usuarios regulares que tengan cualquier rol de controles
 * (genérico, Lima o Arequipa).
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

      const userRoles = await this.userService.getRoleIds(userId);
      return CONTROLES_ROLE_IDS.some((rid) => userRoles.includes(rid));
    } catch {
      return false;
    }
  }
}
