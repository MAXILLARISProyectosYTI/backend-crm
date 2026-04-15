import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Coordenadas geográficas de cada sede (campus).
 * Complementa los datos maestros que vienen del servicio SV.
 * Usado para templates WhatsApp con header LOCATION.
 */
@Entity('campus_coordinates')
export class CampusCoordinates {
  @PrimaryColumn({ type: 'integer', name: 'campus_id' })
  campusId: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;
}
