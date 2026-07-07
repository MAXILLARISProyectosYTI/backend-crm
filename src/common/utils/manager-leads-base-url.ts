const PRODUCTION_DEFAULT = 'https://crm.maxillaris.pe/';

/** Base URL del front manager_leads (creation_patient). Respeta URL_FRONT_MANAGER_LEADS del .env. */
export function getManagerLeadsBaseUrl(envUrl?: string): string {
  const base = (envUrl?.trim() || PRODUCTION_DEFAULT).trim();
  return base.endsWith('/') ? base : `${base}/`;
}
