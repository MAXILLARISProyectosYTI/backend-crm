export class CurrentUserAssignmentsDto {
  // Información del usuario logueado
  id: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  avatarColor?: string;
  isActive?: boolean;
  type?: string;
  
  // Usuarios que tienen oportunidades asignadas por este usuario
  managedUsers: {
    id: string;
    userName?: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    avatarColor?: string;
    isActive?: boolean;
    type?: string;
    assignedOpportunitiesCount: number;
  }[];
  
  // Oportunidades asignadas directamente a este usuario
  myOpportunities: {
    id: string;
    name?: string;
    amount?: number;
    stage?: string;
    createdAt?: Date;
  }[];
  
  // Estadísticas
  totalManagedOpportunities: number;
  totalManagedUsers: number;
  totalMyOpportunities: number;
}
