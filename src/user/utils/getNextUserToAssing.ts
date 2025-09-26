import { OpportunityWithUser } from "src/opportunity/dto/opportunity-with-user";
import { User } from "../user.entity";

export const getNextUserToAssing = (listUsers: User[], lastOpportunityAssigned: OpportunityWithUser) => {

  const lastUserAssigned = lastOpportunityAssigned.assigned_user_id;
  const lastUserAssignedName = lastOpportunityAssigned.assigned_user_user_name;

  // Encontrar el índice del último usuario asignado en la lista ordenada alfabéticamente
  const lastUserIndex = listUsers.findIndex((user) => user.id === lastUserAssigned);
  
  let nextUserIndex = 0; // Por defecto el primer usuario
  
  if (lastUserIndex !== -1) {
    // Si encontramos el usuario en la lista actual, tomar el siguiente
    nextUserIndex = (lastUserIndex + 1) % listUsers.length;
  } else {
    // Si el usuario ya no está en la lista, inferir su posición alfabética
    // basándose en su nombre para determinar quién sería el siguiente
    let inferredPosition = 0;
    
    for (let i = 0; i < listUsers.length; i++) {
      // Comparar alfabéticamente para encontrar dónde estaría el usuario eliminado
      if (lastUserAssignedName.localeCompare(listUsers[i].userName || "", "es", { sensitivity: "base" }) < 0) {
        // El usuario eliminado estaría antes que este usuario en la lista
        // Por lo tanto, este usuario actual sería el siguiente en la rotación
        inferredPosition = i;
        break;
      }
      // Si llegamos al final sin encontrar un usuario "mayor", 
      // significa que el usuario eliminado estaría al final, 
      // entonces el siguiente sería el primer usuario (posición 0)
      inferredPosition = 0;
    }
    
    nextUserIndex = inferredPosition;
  }
  
  return listUsers[nextUserIndex];
}