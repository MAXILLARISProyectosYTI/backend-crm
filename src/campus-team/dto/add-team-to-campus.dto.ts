import { IsInt, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AddTeamToCampusDto {
  @Type(() => Number)
  @IsInt()
  campusId: number;

  @IsString()
  @MaxLength(17)
  teamId: string;
}
