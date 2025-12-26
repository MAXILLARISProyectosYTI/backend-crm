import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OpportunityPresave } from "./opportunity-presave.entity";
import { Opportunity } from "./opportunity.entity";
import { CreateOpportunityPresaveDto } from "./dto/opportunity-presave.dto";

@Injectable()
export class OpportunityPresaveService {
  constructor(
    @InjectRepository(OpportunityPresave)
    private readonly presaveRepository: Repository<OpportunityPresave>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  /**
   * Crear o actualizar un presave para una oportunidad
   * Guarda todos los datos del cliente y facturación
   * También actualiza el campo is_presaved de la oportunidad a true
   */
  async createOrUpdate(dto: CreateOpportunityPresaveDto): Promise<OpportunityPresave> {
    const existing = await this.findByEspoId(dto.espoId);

    let result: OpportunityPresave;

    if (existing) {
      // Actualizar solo los campos que vienen en el DTO (no undefined)
      Object.keys(dto).forEach(key => {
        if (dto[key] !== undefined && key !== 'espoId') {
          existing[key] = dto[key];
        }
      });
      result = await this.presaveRepository.save(existing);
    } else {
      // Crear nuevo presave
      const presave = this.presaveRepository.create(dto);
      result = await this.presaveRepository.save(presave);
    }

    // Actualizar is_presaved = true en la oportunidad
    await this.opportunityRepository.update(
      { id: dto.espoId },
      { isPresaved: true }
    );

    return result;
  }

  /**
   * Buscar presave por espoId (uuid-opportunity)
   */
  async findByEspoId(espoId: string): Promise<OpportunityPresave | null> {
    return await this.presaveRepository.findOne({
      where: { espoId }
    });
  }

  /**
   * Marcar is_presaved = false en la oportunidad
   * Se usa cuando se completa el flujo de facturación
   */
  async markAsNotPresaved(espoId: string): Promise<void> {
    await this.opportunityRepository.update(
      { id: espoId },
      { isPresaved: false }
    );
  }

  /**
   * Verificar si la oportunidad ya fue facturada (isPresaved = false)
   * Si isPresaved = false, significa que ya se completó el flujo de facturación
   */
  async checkIfAlreadyInvoiced(espoId: string): Promise<boolean> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id: espoId }
    });

    // Si isPresaved es false, significa que ya se facturó
    // No devolver presave en ese caso
    if (opportunity && opportunity.isPresaved === false) {
      return true; // Ya fue facturado
    }

    return false; // No ha sido facturado, puede devolver presave
  }

  /**
   * Eliminar presave cuando se completa el flujo
   */
  async deleteByEspoId(espoId: string): Promise<void> {
    await this.presaveRepository.delete({ espoId });
    await this.markAsNotPresaved(espoId);
  }
}
