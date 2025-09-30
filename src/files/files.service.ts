import { Injectable } from '@nestjs/common';
import { Files } from './files.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class FilesService {

  private readonly BASE_URL = process.env.URL_FILES;

  constructor(
    @InjectRepository(Files)
    private readonly filesRepository: Repository<Files>,
  ) {}

  async create(files: Files): Promise<Files> {
    return await this.filesRepository.save(files);
  }

  async findByParentId(parentId: string): Promise<any[]> {
    const files = await this.filesRepository.find({ 
      where: { parent_id: parentId },
      select: ['id', 'parent_id', 'parent_type', 'file_name', 'created_at']
    });
    
    // Construir URLs completas para cada archivo
    return files.map(file => ({
      ...file,
      url: `${this.BASE_URL}/files/${file.id}/view`,
      downloadUrl: `${this.BASE_URL}/files/${file.id}/download`
    }));
  }

  async findOne(id: number): Promise<Files | null> {
    return await this.filesRepository.findOne({ 
      where: { id },
      select: ['id', 'parent_id', 'parent_type', 'file_name', 'created_at']
    });
  }

  async createFileRecord(
    parentId: string, 
    parentType: string, 
    fileName: string, 
    fileContent: Buffer
  ): Promise<Files> {
    const fileRecord = this.filesRepository.create({
      parent_id: parentId,
      parent_type: parentType,
      file_name: fileName,
      file_content: fileContent
    });
    return await this.filesRepository.save(fileRecord);
  }

  async delete(id: number): Promise<void> {
    await this.filesRepository.delete(id);
  }

  /**
   * Obtiene el contenido de un archivo desde la base de datos
   */
  async getFileContent(id: number): Promise<{ file: Files | null; content: Buffer | null }> {
    const file = await this.filesRepository.findOne({ where: { id } });
    if (!file) {
      return { file: null, content: null };
    }
    return { file, content: file.file_content };
  }
}