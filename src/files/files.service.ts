import { Injectable } from '@nestjs/common';
import { Files } from './files.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class FilesService {

  private readonly FILE_PATH = process.env.URL_FILES;

  constructor(
    @InjectRepository(Files)
    private readonly filesRepository: Repository<Files>,
  ) {}

  async create(files: Files): Promise<Files> {
    return await this.filesRepository.save(files);
  }

  async findByParentId(parentId: string): Promise<Files[]> {
    const files = await this.filesRepository.find({ where: { parent_id: parentId } });
    
    // Construir la ruta completa para cada archivo
    return files.map(file => ({
      ...file,
      file_path: `${this.FILE_PATH}/${file.parent_type}/${file.file_name}`
    }));
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

  async delete(id: number): Promise<void> {
    await this.filesRepository.delete(id);
  } 
}