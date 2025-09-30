import { Global, Module } from '@nestjs/common';
import { IdGeneratorService } from './services/id-generator.service';

@Global()
@Module({
  providers: [IdGeneratorService],
  exports: [IdGeneratorService],
})
export class CommonModule {}
