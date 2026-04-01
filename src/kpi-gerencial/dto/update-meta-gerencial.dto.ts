import { PartialType } from '@nestjs/mapped-types';
import { CreateMetaGerencialDto } from './create-meta-gerencial.dto';

export class UpdateMetaGerencialDto extends PartialType(CreateMetaGerencialDto) {}
