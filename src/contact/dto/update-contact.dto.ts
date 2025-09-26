import { PartialType } from '@nestjs/mapped-types';
import { Contact } from '../contact.entity';

export class UpdateContactDto extends PartialType(Contact) {}
