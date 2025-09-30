import { Controller, Get, UseGuards } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Campaign } from './campaign.entity';

@UseGuards(JwtAuthGuard)
@Controller('campaign')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get('get-all')
  async findAll(): Promise<Campaign[]> {
    return await this.campaignService.findAll();
  }
}
