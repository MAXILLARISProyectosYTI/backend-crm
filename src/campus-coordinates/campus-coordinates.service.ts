import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampusCoordinates } from './campus-coordinates.entity';

@Injectable()
export class CampusCoordinatesService {
  constructor(
    @InjectRepository(CampusCoordinates)
    private readonly repo: Repository<CampusCoordinates>,
  ) {}

  async findAll(): Promise<CampusCoordinates[]> {
    return this.repo.find();
  }

  async findByCampusId(campusId: number): Promise<CampusCoordinates | null> {
    return this.repo.findOne({ where: { campusId } });
  }

  /** Mapa campusId → { latitude, longitude } para merge rápido con datos SV. */
  async getCoordinatesMap(): Promise<Map<number, { latitude: number | null; longitude: number | null }>> {
    const rows = await this.repo.find();
    return new Map(
      rows.map((r) => [
        r.campusId,
        {
          latitude: r.latitude != null ? Number(r.latitude) : null,
          longitude: r.longitude != null ? Number(r.longitude) : null,
        },
      ]),
    );
  }
}
