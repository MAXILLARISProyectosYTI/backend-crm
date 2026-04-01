import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { FilteredUsersService, UserPublic } from './filtered-users.service';

/**
 * Listados de usuarios con filtros de negocio (excluye roles / tipos restringidos).
 * Endpoints públicos: no requieren JWT.
 */
@Public()
@Controller('filtered-users')
export class FilteredUsersController {
  constructor(private readonly filteredUsersService: FilteredUsersService) {}

  /**
   * Comprueba si el nombre de usuario de SV coincide con `c_usersv` de algún usuario
   * del listado filtrado (equipos permitidos, sin admin/system ni cerradora/asistente comercial).
   * @example GET /filtered-users/match-sv-username?svUserName=juan.perez
   */
  @Get('match-sv-username')
  async matchSvUsername(@Query('svUserName') svUserName: string): Promise<boolean> {
    const trimmed = (svUserName ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('svUserName es obligatorio y no puede estar vacío');
    }
    return this.filteredUsersService.matchesSvUserName(trimmed);
  }
}
