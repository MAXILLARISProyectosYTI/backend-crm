import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incidencia, EstadoIncidencia } from './incidencia.entity';
import { CreateIncidenciaDto, UpdateEstadoDto } from './incidencias.dto';

@Injectable()
export class IncidenciasService implements OnModuleInit {
  private readonly logger = new Logger(IncidenciasService.name);

  constructor(
    @InjectRepository(Incidencia)
    private readonly repo: Repository<Incidencia>,
  ) {}

  /**
   * Crea la tabla crm_incidencias si no existe.
   * Usa el query runner del propio repositorio (sin inyectar DataSource).
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.repo.query(`
        CREATE TABLE IF NOT EXISTS crm_incidencias (
          id                   SERIAL PRIMARY KEY,
          titulo               VARCHAR(255)  NOT NULL,
          descripcion          TEXT          NOT NULL,
          tipo                 VARCHAR(50)   NOT NULL DEFAULT 'Queja',
          prioridad            VARCHAR(10)   NOT NULL DEFAULT 'Media',
          estado               VARCHAR(20)   NOT NULL DEFAULT 'Abierta',
          paciente_id          INTEGER       NOT NULL,
          paciente_nombre      VARCHAR(255)  NOT NULL,
          creada_por           VARCHAR(100)  NOT NULL DEFAULT 'Admin',
          fecha_creacion       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
          fecha_actualizacion  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
        );
      `);
      this.logger.log('Tabla crm_incidencias lista ✓');
    } catch (err) {
      this.logger.error('Error creando tabla crm_incidencias:', err);
    }
  }

  findAll(): Promise<Incidencia[]> {
    return this.repo.find({ order: { fechaCreacion: 'DESC' } });
  }

  async create(dto: CreateIncidenciaDto): Promise<Incidencia> {
    const inc = new Incidencia();
    inc.titulo         = dto.titulo;
    inc.descripcion    = dto.descripcion;
    inc.tipo           = dto.tipo as Incidencia['tipo'];
    inc.prioridad      = dto.prioridad as Incidencia['prioridad'];
    inc.pacienteId     = dto.pacienteId;
    inc.pacienteNombre = dto.pacienteNombre;
    inc.creadaPor      = dto.creadaPor ?? 'Admin';
    inc.estado         = 'Abierta';
    return this.repo.save(inc);
  }

  async updateEstado(id: number, dto: UpdateEstadoDto): Promise<Incidencia | null> {
    await this.repo.update(id, { estado: dto.estado as unknown as EstadoIncidencia });
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
