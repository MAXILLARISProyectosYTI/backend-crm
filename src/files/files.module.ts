import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FileUploadService } from './file-upload.service';
import { FilesController } from './files.controller';
import { Files } from './files.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Files])],
  controllers: [FilesController],
  providers: [FilesService, FileUploadService],
  exports: [FilesService, FileUploadService],  
})
export class FilesModule {}
