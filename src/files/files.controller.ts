import { Controller, Get, Param, Res, NotFoundException, UseGuards, Post, UploadedFiles, UseInterceptors, Delete, Body } from '@nestjs/common';
import type { Response } from 'express';
import { FileUploadService } from './file-upload.service';
import { FileType, DirectoryType } from './dto/files.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ParamBasedFileInterceptor } from 'src/interceptors/param-based-file.interceptor';
import { join } from 'path';
import { existsSync } from 'fs';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly fileUploadService: FileUploadService) {}
}
