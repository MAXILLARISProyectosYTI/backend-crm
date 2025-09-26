import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './contact.entity';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
  ) {}

  create(createContactDto: CreateContactDto) {
    return this.contactRepository.save(createContactDto);
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
