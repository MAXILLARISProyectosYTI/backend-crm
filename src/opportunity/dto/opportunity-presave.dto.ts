import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateOpportunityPresaveDto {
  @IsString()
  @MaxLength(255)
  espoId: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastNameFather?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastNameMother?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cellphone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsString()
  @IsNotEmpty({ message: 'El campo apoderado es obligatorio para preguardar' })
  @MaxLength(255)
  attorney: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiseTypeDocument?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiseNumDocument?: string;
}

