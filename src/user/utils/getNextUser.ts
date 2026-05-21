import { OpportunityWithUser } from "src/opportunity/dto/opportunity-with-user";
import { User } from "../user.entity";

/**
 * Dado la lista de usuarios activos (ordenada alfabéticamente) y la referencia del
 * último usuario asignado, devuelve el siguiente en la cola round-robin.
 *
 * Casos:
 * 1. El usuario está en la lista → toma el siguiente (con wrap-around al primero).
 * 2. El usuario NO está en la lista (ocupado / removido) → busca el primer usuario
 *    que venga DESPUÉS de él alfabéticamente. Si ninguno lo supera (estaba al final),
 *    vuelve al primero (wrap-around).
 */
export const getNextUser = (listUsers: User[], lastOpportunityAssigned: OpportunityWithUser): User | null => {
  if (!listUsers.length) return null;

  const lastUserId   = lastOpportunityAssigned.assigned_user_id;
  const lastUserName = (lastOpportunityAssigned.assigned_user_user_name ?? '').trim();

  // ── Caso 1: el usuario sigue activo en la lista ───────────────────────────
  const lastUserIndex = listUsers.findIndex((u) => u.id === lastUserId);
  if (lastUserIndex !== -1) {
    return listUsers[(lastUserIndex + 1) % listUsers.length];
  }

  // ── Caso 2: usuario fuera de la lista (ocupado/eliminado) ─────────────────
  // Recorremos la lista (ya ordenada alfabéticamente) y devolvemos el primero
  // cuyo nombre sea estrictamente posterior al del último asignado.
  for (const user of listUsers) {
    const cmp = lastUserName.localeCompare(
      user.userName ?? '',
      'es',
      { sensitivity: 'base' },
    );
    if (cmp < 0) {
      // lastUserName < user.userName → este usuario es el siguiente en orden
      return user;
    }
  }

  // Ningún usuario viene después → wrap-around al primero
  return listUsers[0];
};
