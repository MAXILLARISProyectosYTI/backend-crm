import { Global, Module } from '@nestjs/common';
import { IdGeneratorService } from './services/id-generator.service';
import { FileManagerService } from './services/file-manager.service';

@Global()
@Module({
  providers: [IdGeneratorService, FileManagerService],
  exports: [IdGeneratorService, FileManagerService],
})
export class CommonModule {}
