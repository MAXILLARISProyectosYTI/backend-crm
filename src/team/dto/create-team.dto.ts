import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  positionList?: string;
}
