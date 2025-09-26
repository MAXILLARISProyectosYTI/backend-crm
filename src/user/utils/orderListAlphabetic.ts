import { User } from "../user.entity";

export const orderListAlphabetic = (list: User[]): User[] => {
  return [...list].sort((a, b) => 
    a.userName!.localeCompare(b.userName!, "es", { sensitivity: "base" }) || 0
  );
};
