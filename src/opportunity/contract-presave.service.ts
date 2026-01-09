import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractPresave } from './contract-presave.entity';
import { CreateContractPresaveDto } from './dto/contract-presave.dto';

@Injectable()
export class ContractPresaveService {
  constructor(
    @InjectRepository(ContractPresave)
    private contractPresaveRepository: Repository<ContractPresave>,
  ) {}

  /**
   * Crear o actualizar un presave de contrato
   * Si ya existe uno con el mismo quotationId, lo actualiza
   */
  async createOrUpdate(dto: CreateContractPresaveDto): Promise<ContractPresave> {
    // Buscar si ya existe un presave para esta cotización
    let presave = await this.contractPresaveRepository.findOne({
      where: { quotationId: dto.quotationId },
    });

    if (presave) {
      // Actualizar el existente
      Object.assign(presave, dto);
      return this.contractPresaveRepository.save(presave);
    } else {
      // Crear uno nuevo
      const newPresave = this.contractPresaveRepository.create(dto);
      return this.contractPresaveRepository.save(newPresave);
    }
  }

  /**
   * Obtener el presave de un contrato por quotationId
   */
  async findByQuotationId(quotationId: number): Promise<ContractPresave | null> {
    return this.contractPresaveRepository.findOne({
      where: { quotationId },
    });
  }

  /**
   * Eliminar el presave de un contrato
   */
  async delete(quotationId: number): Promise<void> {
    await this.contractPresaveRepository.delete({ quotationId });
  }
}

