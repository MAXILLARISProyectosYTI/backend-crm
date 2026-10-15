import { IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class ConfirmGerenciaBandDto {
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
  totalAmount: number;
}
