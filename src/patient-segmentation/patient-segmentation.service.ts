import { Injectable } from '@nestjs/common';
import { SvServices } from '../sv-services/sv.services';
import { FilterSegmentsDto } from './dto/filter-segments.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Injectable()
export class PatientSegmentationService {
  constructor(private readonly svServices: SvServices) {}

  private async getToken(): Promise<string> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    return tokenSv;
  }

  async getList(filters: FilterSegmentsDto) {
    const tokenSv = await this.getToken();
    return this.svServices.getSegmentationList(tokenSv, filters as Record<string, any>);
  }

  async getStats(companyId?: number) {
    const tokenSv = await this.getToken();
    return this.svServices.getSegmentationStats(tokenSv, companyId);
  }

  async getEvolution(days?: number) {
    const tokenSv = await this.getToken();
    return this.svServices.getSegmentationEvolution(tokenSv, days);
  }

  async getAlertsCritical(companyId?: number) {
    const tokenSv = await this.getToken();
    return this.svServices.getSegmentationAlertsCritical(tokenSv, companyId);
  }

  async getAlertsAtRisk(companyId?: number) {
    const tokenSv = await this.getToken();
    return this.svServices.getSegmentationAlertsAtRisk(tokenSv, companyId);
  }

  async getRules() {
    const tokenSv = await this.getToken();
    return this.svServices.getSegmentationRules(tokenSv);
  }

  async updateRule(dto: UpdateRuleDto) {
    const tokenSv = await this.getToken();
    return this.svServices.updateSegmentationRule(tokenSv, dto);
  }

  async recalculate(patientIds?: number[]) {
    const tokenSv = await this.getToken();
    return this.svServices.recalculateSegmentation(tokenSv, patientIds);
  }

  async getPatientDetail(patientId: number) {
    const tokenSv = await this.getToken();
    return this.svServices.getSegmentationPatientDetail(tokenSv, patientId);
  }

  async getPatientHistory(patientId: number) {
    const tokenSv = await this.getToken();
    return this.svServices.getSegmentationPatientHistory(tokenSv, patientId);
  }
}
