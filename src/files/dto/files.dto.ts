export enum FileType {
  IMAGE = 'image',
  PDF = 'pdf',
  ALL = 'all',
}

export enum DirectoryType {
  OPPORTUNITIES = 'opportunities',
  CONTACTS = 'contacts',
  USERS = 'users',
  MEETINGS = 'meetings',
  ACTION_HISTORY = 'action-history',
}

export interface FileUploadOptions {
  file?: Express.Multer.File;
  url?: string;
  fileType: FileType;
  directory: DirectoryType;
  customFileName?: string;
  entityId?: string; // ID de la entidad para organizar archivos
}

export interface FileUploadResult {
  fileName: string;
  filePath: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
}