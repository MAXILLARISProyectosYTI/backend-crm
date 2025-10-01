import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ENUM_TARGET_TYPE } from "./enum-target-type";

export class CreateActionDto {
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(ENUM_TARGET_TYPE)
  target_type: ENUM_TARGET_TYPE

  @IsOptional()
  @IsArray()
  files?: Express.Multer.File[];
}