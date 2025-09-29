import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './contact.entity';
import { IdGeneratorService } from '../common/services/id-generator.service';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly idGeneratorService: IdGeneratorService,
  ) {}

  async create(createContactDto: CreateContactDto): Promise<Contact> {
    // Crear una nueva instancia del contacto con ID generado por el servicio
    const contact = this.contactRepository.create({
      id: this.idGeneratorService.generateId(),
      firstName: createContactDto.firstName,
      lastName: createContactDto.lastName,
      salutationName: createContactDto.salutationName,
      description: createContactDto.description,
      middleName: createContactDto.middleName,
      addressStreet: createContactDto.addressStreet,
      addressCity: createContactDto.addressCity,
      addressState: createContactDto.addressState,
      addressCountry: createContactDto.addressCountry,
      addressPostalCode: createContactDto.addressPostalCode,
      deleted: false,
      doNotCall: false,
    });

    return await this.contactRepository.save(contact);
  }

  async getById(id: string) {
    return await this.contactRepository.findOne({ where: { id } });
  }

  async softDelete(id: string) {
    const contact = await this.getById(id);

    if(!contact){
      throw new NotFoundException(`Contacto con ID ${id} no encontrado`);
    }

    contact.deleted = true;
    contact.modifiedAt = new Date();
    return await this.contactRepository.save(contact);
  }

  async update(id: string, updateContactDto: UpdateContactDto) {
    const contact = await this.getById(id);
    if(!contact){
      throw new NotFoundException(`Contacto con ID ${id} no encontrado`);
    }

    contact.firstName = updateContactDto.firstName || contact.firstName;
    contact.lastName = updateContactDto.lastName || contact.lastName;
    contact.modifiedAt = new Date();
    return await this.contactRepository.save(contact);
  }
}
