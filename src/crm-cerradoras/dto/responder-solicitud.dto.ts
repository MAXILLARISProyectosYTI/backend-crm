import { IsEnum, IsOptional, IsString } from 'class-validator';
import type { EstadoSolicitud } from '../crm-cerradora-solicitud.entity';

export class ResponderSolicitudDto {
  @IsEnum(['aprobada', 'rechazada'])
  estado: EstadoSolicitud;

  @IsOptional()
  @IsString()
  comentarioAdmin?: string | null;
}
