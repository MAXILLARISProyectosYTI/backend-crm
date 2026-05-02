import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SegmentType } from './filter-segments.dto';

export class UpdateRuleDto {
  @IsEnum(SegmentType)
  segment: SegmentType;

  @IsNotEmpty()
  @IsString()
  ruleKey: string;

  @IsNotEmpty()
  @IsString()
  ruleValue: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}
