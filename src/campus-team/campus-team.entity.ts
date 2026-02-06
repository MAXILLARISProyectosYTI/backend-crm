import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Relación sede (campus externo) -> equipo del CRM.
 * Define qué equipos atienden cada sede para la cola de autoasignación.
 */
@Entity('campus_team')
export class CampusTeam {
  @PrimaryColumn({ type: 'integer', name: 'campus_id' })
  campusId: number;

  @PrimaryColumn({ type: 'varchar', length: 17, name: 'team_id' })
  teamId: string;
}
