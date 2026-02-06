import { IsInt, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class MoveTeamToCampusDto {
  /** Sede de origen (de la que se quita el equipo). */
  @Type(() => Number)
  @IsInt()
  fromCampusId: number;

  /** Sede de destino (a la que se asigna el equipo). */
  @Type(() => Number)
  @IsInt()
  toCampusId: number;

  @IsString()
  @MaxLength(17)
  teamId: string;
}
