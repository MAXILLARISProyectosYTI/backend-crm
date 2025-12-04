import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './campaign.entity';

@Injectable()
export class CampaignService {
  
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
  ) {}

  async findAll() {
    return await this.campaignRepository.createQueryBuilder('c')
      .select([
        'c.id as id',
        'c.name as name',
        'c.status as status',
        'c.type as type',
        'c.createdAt as "createdAt"',
        'c.createdById as "createdById"',
        'c.assignedUserId as "assignedUserId"',
      ])
      .where('c.deleted = :deleted', { deleted: false })
      .getRawMany();
  }

  async findOne(id: string) {
    const campaign = await this.campaignRepository.findOne({
      where: { id, deleted: false },
    });

    if(!campaign) {
      throw new NotFoundException(`Campaña con ID ${id} no encontrada`);
    }

    return campaign;
  }
}
