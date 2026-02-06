import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/** Body opcional para POST /team/:id/users/:userId */
export class AddUserToTeamDto {
  /** Si el usuario ya está en este equipo, enviar true para confirmar. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  confirm?: boolean;

  /** Si el usuario ya está en otro equipo, enviar true para permitir asignación a dos equipos. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  confirmAsignacionDoble?: boolean;

  /** Confirmar que entiende las consecuencias de asignar a dos equipos (lógica/negocio). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  confirmConsecuencias?: boolean;

  /** Si es true, quita al usuario de todos los equipos actuales y lo asigna solo a este (mover de equipo). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mover?: boolean;
}
