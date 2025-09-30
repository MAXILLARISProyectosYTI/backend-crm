import { User } from "../user.entity";

export const orderListAlphabetic = (list: User[]): User[] => {
  // Filtrar duplicados por id
  const uniqueUsers = Array.from(
    new Map(list.map(user => [user.id, user])).values()
  );
  
  // Ordenar alfabéticamente por userName
  return uniqueUsers.sort((a, b) => 
    a.userName!.localeCompare(b.userName!, "es", { sensitivity: "base" }) || 0
  );
};
