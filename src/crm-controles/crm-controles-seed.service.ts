import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ROLES_IDS, TEAMS_IDS } from 'src/globals/ids';

const ROLE_NAME = 'Controles';
const TEAM_NAME = 'Equipo ejecutivos controles';

@Injectable()
export class CrmControlesSeedService implements OnModuleInit {
  private readonly logger = new Logger(CrmControlesSeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedRole();
      await this.seedTeam();
    } catch (err) {
      this.logger.warn(
        `Seed controles: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async seedRole(): Promise<void> {
    const existing = await this.dataSource.query(
      `SELECT id FROM "role" WHERE id = $1`,
      [ROLES_IDS.CONTROLES],
    );
    if (existing.length > 0) return;

    await this.dataSource.query(
      `INSERT INTO "role" (id, name, deleted, created_at, modified_at)
       VALUES ($1, $2, false, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ROLES_IDS.CONTROLES, ROLE_NAME],
    );
    this.logger.log(`Rol "${ROLE_NAME}" creado (${ROLES_IDS.CONTROLES})`);
  }

  private async seedTeam(): Promise<void> {
    const existing = await this.dataSource.query(
      `SELECT id FROM "team" WHERE id = $1`,
      [TEAMS_IDS.EQ_EJECUTIVOS_CONTROLES],
    );
    if (existing.length > 0) return;

    await this.dataSource.query(
      `INSERT INTO "team" (id, name, deleted, created_at, modified_at)
       VALUES ($1, $2, false, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEAMS_IDS.EQ_EJECUTIVOS_CONTROLES, TEAM_NAME],
    );
    this.logger.log(`Equipo "${TEAM_NAME}" creado (${TEAMS_IDS.EQ_EJECUTIVOS_CONTROLES})`);
  }
}
