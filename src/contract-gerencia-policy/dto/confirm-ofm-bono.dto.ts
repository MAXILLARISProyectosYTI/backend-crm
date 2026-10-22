import { IsIn, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class ConfirmOfmBonoDto {
  @IsString()
  @MinLength(1)
  approverUserName: string;

  @IsString()
  @MinLength(1)
  approverPassword: string;

  @IsOptional()
  @IsNumber()
  quotationId?: number;

  @IsString()
  contractType: string;

  @IsIn(['Al contado', 'En cuotas'])
  paymentMethod: 'Al contado' | 'En cuotas';

  @IsNumber()
  @Min(0.01)
  @Max(1800)
  montoBono: number;
}
