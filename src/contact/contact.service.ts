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

  getById(id: string) {
    return this.contactRepository.findOne({ where: { id } });
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
}
