import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incidencia, EstadoIncidencia } from './incidencia.entity';
import { User } from 'src/user/user.entity';
import { CreateIncidenciaDto, UpdateEstadoDto } from './incidencias.dto';

@Injectable()
export class IncidenciasService implements OnModuleInit {
  private readonly logger = new Logger(IncidenciasService.name);

  constructor(
    @InjectRepository(Incidencia)
    private readonly repo: Repository<Incidencia>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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
          ejecutivo_username   VARCHAR(100),
          area_destino         VARCHAR(50)   DEFAULT 'CRM Controles',
          fecha_creacion       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
          fecha_actualizacion  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
        );
      `);
      await this.repo.query(`
        DO $$ BEGIN
          ALTER TABLE crm_incidencias ADD COLUMN IF NOT EXISTS ejecutivo_username VARCHAR(100);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
      await this.repo.query(`
        DO $$ BEGIN
          ALTER TABLE crm_incidencias ADD COLUMN IF NOT EXISTS area_destino VARCHAR(50) DEFAULT 'CRM Controles';
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
      this.logger.log('Tabla crm_incidencias lista ✓');
    } catch (err) {
      this.logger.error('Error creando tabla crm_incidencias:', err);
    }
  }

  findAll(): Promise<Incidencia[]> {
    return this.repo.find({ order: { fechaCreacion: 'DESC' } });
  }

  /**
   * Admin → todas; usuario regular → solo las de sus pacientes asignados.
   * Si se pasa `area`, filtra adicionalmente por area_destino.
   */
  async findAllForUser(userId: string | null, pacienteId?: number, area?: string): Promise<Incidencia[]> {
    if (pacienteId) return this.findByPaciente(pacienteId);

    const qb = this.repo.createQueryBuilder('i').orderBy('i.fechaCreacion', 'DESC');

    if (area) {
      qb.andWhere('i.areaDestino = :area', { area });
    }

    if (!userId) return qb.getMany();

    const user = await this.userRepo.findOne({ where: { id: userId, deleted: false } });
    if (!user || user.type === 'admin') return qb.getMany();

    const svUsername = (user.cUsersv ?? '').trim().toLowerCase();
    if (!svUsername) return [];

    qb.andWhere('LOWER(TRIM(i.ejecutivoUsername)) = :svUsername', { svUsername });
    return qb.getMany();
  }

  findByPaciente(pacienteId: number): Promise<Incidencia[]> {
    return this.repo.find({
      where: { pacienteId },
      order: { fechaCreacion: 'DESC' },
    });
  }

  async create(dto: CreateIncidenciaDto): Promise<Incidencia> {
    const inc = new Incidencia();
    inc.titulo             = dto.titulo;
    inc.descripcion        = dto.descripcion;
    inc.tipo               = dto.tipo as Incidencia['tipo'];
    inc.prioridad          = dto.prioridad as Incidencia['prioridad'];
    inc.pacienteId         = dto.pacienteId;
    inc.pacienteNombre     = dto.pacienteNombre;
    inc.creadaPor          = dto.creadaPor ?? 'Admin';
    inc.ejecutivoUsername   = dto.ejecutivoUsername?.trim().toLowerCase() ?? null;
    inc.areaDestino        = dto.areaDestino ?? 'Recepción';
    inc.estado             = 'Abierta';
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
