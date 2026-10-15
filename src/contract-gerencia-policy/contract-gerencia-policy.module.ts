import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'src/user/user.module';
import { ContractGerenciaBandUsage } from './contract-gerencia-band-usage.entity';
import { ContractGerenciaPolicyController } from './contract-gerencia-policy.controller';
import { ContractGerenciaPolicyService } from './contract-gerencia-policy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContractGerenciaBandUsage]),
    UserModule,
  ],
  controllers: [ContractGerenciaPolicyController],
  providers: [ContractGerenciaPolicyService],
  exports: [ContractGerenciaPolicyService],
})
export class ContractGerenciaPolicyModule {}
