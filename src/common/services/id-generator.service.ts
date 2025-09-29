import { Injectable } from '@nestjs/common';

@Injectable()
export class IdGeneratorService {
  /**
   * Genera un ID único de 17 caracteres hexadecimales
   * Similar al formato utilizado por EspoCRM: 689e2a6c4ba9003ba
   * @returns string ID de 17 caracteres hexadecimales
   */
  generateId(): string {
    const timestamp = Date.now();
    const random1 = Math.floor(Math.random() * 0xffffff);
    const random2 = Math.floor(Math.random() * 0xffffff);
    
    // Convertir a hexadecimal y combinar
    const timestampHex = timestamp.toString(16);
    const random1Hex = random1.toString(16).padStart(6, '0');
    const random2Hex = random2.toString(16).padStart(6, '0');
    
    // Combinar y asegurar exactamente 17 caracteres
    const combined = (timestampHex + random1Hex + random2Hex).toLowerCase();
    
    // Tomar exactamente 17 caracteres
    if (combined.length >= 17) {
      return combined.substring(0, 17);
    } else {
      // Si es menor a 17, rellenar con ceros a la izquierda
      return combined.padStart(17, '0');
    }
  }

  /**
   * Genera múltiples IDs únicos
   * @param count Número de IDs a generar
   * @returns string[] Array de IDs únicos
   */
  generateMultipleIds(count: number): string[] {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      // Pequeño delay para asegurar timestamps únicos
      const id = this.generateId();
      ids.push(id);
    }
    return ids;
  }

  /**
   * Valida si un ID tiene el formato correcto
   * @param id ID a validar
   * @returns boolean true si es válido
   */
  isValidId(id: string): boolean {
    // Debe ser exactamente 17 caracteres hexadecimales
    return /^[0-9a-f]{17}$/i.test(id);
  }
}
