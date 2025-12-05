import { IsString, IsBoolean, IsOptional, IsEmail, IsNotEmpty, IsArray, IsEnum } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  userName: string;

  @IsNotEmpty()
  @IsEnum(['admin', 'regular'])
  type: 'admin' | 'regular';

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsBoolean()
  isActive: boolean;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  gender: string;

  @IsNotEmpty()
  @IsArray()
  teamsIds: string[];

  @IsNotEmpty()
  @IsArray()
  rolesIds: string[];

  @IsNotEmpty()
  @IsString()
  cUsersv: string;

  @IsNotEmpty()
  @IsString()
  cContraseaSv: string;
}
