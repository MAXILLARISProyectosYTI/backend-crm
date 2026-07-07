import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from '../opportunity/opportunity.entity';
import { Enum_Stage } from '../opportunity/dto/enums';
import { ReferralCashbackSvService } from '../referral-cashback/services/referral-cashback-sv.service';
import { User } from '../user/user.entity';

export type ReferralChildLink = {
  directReferrerId: string;
  familyRootId: string;
  contactId: string;
  assigneeUser: User | null;
  familyRoot: Opportunity;
  directReferrer: Opportunity;
};

export type ResolvedReferrerForCloser = {
  directReferrer: Opportunity;
  familyRoot: Opportunity;
};

@Injectable()
export class ReferralLineageService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly referralCashbackSvService: ReferralCashbackSvService,
  ) {}

  async loadOpportunity(id: string): Promise<Opportunity | null> {
    if (!id?.trim()) return null;
    return this.opportunityRepository.findOne({
      where: { id: id.trim(), deleted: false },
      relations: ['assignedUserId'],
    });
  }

  /**
   * Titular raíz del núcleo (opp no-REF). Usa columna persistida o recorre c_primary.
   */
  async resolveFamilyRoot(opp: Opportunity): Promise<Opportunity> {
    if (!opp.cIsReferralCreation) {
      return opp;
    }

    if (opp.cReferralRootOpportunityId) {
      const persisted = await this.loadOpportunity(opp.cReferralRootOpportunityId);
      if (persisted && persisted.cIsReferralCreation !== true) {
        return persisted;
      }
    }

    let current: Opportunity | null = opp;
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.cIsReferralCreation !== true) {
        return current;
      }
      if (!current.cPrimaryOpportunityId) {
        break;
      }
      current = await this.loadOpportunity(current.cPrimaryOpportunityId);
    }

    return opp;
  }

  async isOpportunityEligibleAsReferrer(opportunityId: string): Promise<boolean> {
    const patientId = await this.referralCashbackSvService.getPatientIdByOpportunityEspoId(
      opportunityId,
    );
    if (!patientId) {
      return false;
    }
    return this.referralCashbackSvService.isPatientReferrerEligible(patientId);
  }

  /**
   * Metadatos para crear un referido hijo: referidor directo + raíz familiar.
   */
  async buildChildReferralLink(directReferrerId: string): Promise<ReferralChildLink | null> {
    const directReferrer = await this.loadOpportunity(directReferrerId);
    if (!directReferrer) {
      return null;
    }

    const familyRoot = await this.resolveFamilyRoot(directReferrer);
    if (!familyRoot.contactId) {
      return null;
    }

    const assigneeRaw = directReferrer.assignedUserId ?? familyRoot.assignedUserId;
    const assigneeUser =
      assigneeRaw && typeof assigneeRaw === 'object' ? (assigneeRaw as User) : null;

    return {
      directReferrerId: directReferrer.id,
      familyRootId: familyRoot.id,
      contactId: familyRoot.contactId,
      assigneeUser,
      familyRoot,
      directReferrer,
    };
  }

  /**
   * Quién debe figurar como referidor al crear REF desde cerradoras (HC nueva del amigo).
   */
  async resolveReferrerForCloser(params: {
    closerOpportunityId?: string | null;
    hcCode: string;
  }): Promise<ResolvedReferrerForCloser | null> {
    const hcCode = params.hcCode?.trim();
    if (!hcCode) return null;

    const byHc = await this.opportunityRepository.find({
      where: { cClinicHistory: hcCode, deleted: false },
    });

    const candidates: Opportunity[] = [];
    const seen = new Set<string>();

    const addCandidate = async (opp: Opportunity | null | undefined) => {
      if (!opp?.id || opp.deleted || seen.has(opp.id)) return;
      seen.add(opp.id);
      candidates.push(opp);
    };

    const closerId = params.closerOpportunityId?.trim();
    if (closerId) {
      await addCandidate(await this.loadOpportunity(closerId));
    }

    for (const o of byHc ?? []) {
      await addCandidate(o);
    }

    // Prioridad: REF elegible enlazado → usar como referidor directo (Megumi trae amigo)
    for (const c of candidates) {
      if (c.cIsReferralCreation === true) {
        const eligible = await this.isOpportunityEligibleAsReferrer(c.id);
        if (eligible) {
          const familyRoot = await this.resolveFamilyRoot(c);
          return { directReferrer: c, familyRoot };
        }
      }
    }

    // Titular no-REF o subir al raíz desde REF no elegible
    for (const c of candidates) {
      if (c.cIsReferralCreation !== true) {
        return { directReferrer: c, familyRoot: c };
      }
      if (c.cPrimaryOpportunityId) {
        const parent = await this.loadOpportunity(c.cPrimaryOpportunityId);
        if (parent) {
          const familyRoot = await this.resolveFamilyRoot(parent);
          return { directReferrer: familyRoot, familyRoot };
        }
      }
    }

    return null;
  }

  /** Raíz con cierre ganado preferido entre varias candidatas legacy. */
  async resolveFamilyTitularForCloser(params: {
    closerOpportunityId?: string | null;
    hcCode: string;
  }): Promise<Opportunity | null> {
    const resolved = await this.resolveReferrerForCloser(params);
    return resolved?.familyRoot ?? null;
  }

  scoreTitularCandidate(o: Opportunity): number {
    let s = 0;
    if (o.stage === Enum_Stage.CIERRE_GANADO) s += 100;
    if (o.cClinicHistory?.trim()) s += 10;
    return s;
  }
}
