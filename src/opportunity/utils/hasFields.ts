import { UpdateOpportunityDto, UpdateOpportunityProcces } from "../dto/update-opportunity.dto";

export const hasFields = (campos: string[], body: UpdateOpportunityProcces) =>
  campos.every((campo) => body[campo] !== undefined);

export const pickFields = (campos: string[], body: UpdateOpportunityProcces) =>
  campos.reduce((acc, campo) => {
    if (body[campo] !== undefined) acc[campo] = body[campo];
    return acc;
  }, {} as Record<string, any>);

  // Sumar manualmente 5 horas para ajustar a la zona horaria de Perú (UTC-5)
// EspoCRM espera la hora en UTC, por eso se suma 5 horas a la hora local
export const addHours = (dateTimeStr: string, hours: number) => {
  const date = new Date(dateTimeStr.replace(/-/g, "/"));
  date.setHours(date.getHours() + hours);
  // Formato: YYYY-MM-DD HH:mm:ss
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
};
