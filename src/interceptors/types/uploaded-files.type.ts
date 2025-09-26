export interface UploadedFileInfo {
  filename: string;
  originalname: string;
  path: string;
  size: number;
  mimetype: string;
}

export interface UploadedFiles {
  documents?: Express.Multer.File[];
  images?: Express.Multer.File[];
  attachments?: Express.Multer.File[];
  avatar?: Express.Multer.File[];
  photo?: Express.Multer.File[];
}

export interface ProcessedUploadedFiles {
  documents?: UploadedFileInfo[];
  images?: UploadedFileInfo[];
  attachments?: UploadedFileInfo[];
  avatar?: UploadedFileInfo[];
  photo?: UploadedFileInfo[];
}

// Función helper para procesar archivos subidos
export function processUploadedFiles(files: UploadedFiles): ProcessedUploadedFiles {
  const processed: ProcessedUploadedFiles = {};

  Object.keys(files).forEach(key => {
    const fileArray = files[key as keyof UploadedFiles];
    if (fileArray && fileArray.length > 0) {
      processed[key as keyof ProcessedUploadedFiles] = fileArray.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));
    }
  });

  return processed;
}
