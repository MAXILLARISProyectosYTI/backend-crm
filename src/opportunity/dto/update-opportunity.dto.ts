import { PartialType } from '@nestjs/mapped-types';
import { Opportunity } from '../opportunity.entity';

export class UpdateOpportunityDto extends PartialType(Opportunity) {}
