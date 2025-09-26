import { CAMPAIGNS_IDS, TEAMS_IDS } from "../lib/ids";

export const getTeamsBySubCampaing = (subCampaignId: string): string[] => {
  if(subCampaignId === CAMPAIGNS_IDS.OI){
    return [TEAMS_IDS.EJ_COMERCIAL_OI];
  }
  if(subCampaignId === CAMPAIGNS_IDS.OFM){
    return [TEAMS_IDS.EJ_COMERCIAL, TEAMS_IDS.TEAM_FIORELLA, TEAMS_IDS.TEAM_VERONICA, TEAMS_IDS.TEAM_MICHELL];
  }
  if(subCampaignId === CAMPAIGNS_IDS.APNEA){
    return [TEAMS_IDS.EJ_COMERCIAL_APNEA];
  }
  
  return [];
}