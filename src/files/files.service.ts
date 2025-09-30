import { Injectable } from '@nestjs/common';
import { Files } from './files.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class FilesService {

  constructor(
    @InjectRepository(Files)
    private readonly filesRepository: Repository<Files>,
  ) {}

  async create(files: Files): Promise<Files> {
    return await this.filesRepository.save(files);
  }

  async findByParentId(parentId: string): Promise<Files[]> {
    return await this.filesRepository.find({ where: { parent_id: parentId } });
  }

  async findOne(id: number): Promise<Files | null> {
    return await this.filesRepository.findOne({ where: { id } });
  }

  async createFileRecord(parentId: string, parentType: string, fileName: string): Promise<Files> {
    const fileRecord = this.filesRepository.create({
      parent_id: parentId,
      parent_type: parentType,
      file_name: fileName
    });
    return await this.filesRepository.save(fileRecord);
  }
  
}
