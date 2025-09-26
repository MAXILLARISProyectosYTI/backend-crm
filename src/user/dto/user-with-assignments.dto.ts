export class UserWithAssignmentsDto {
  // Información del usuario logueado
  id: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  avatarColor?: string;
  isActive?: boolean;
  type?: string;
  
  // Usuarios asignados (oportunidades asignadas a este usuario)
  assignedUsers: {
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
  
  // Estadísticas
  totalAssignedOpportunities: number;
  totalAssignedUsers: number;
}
