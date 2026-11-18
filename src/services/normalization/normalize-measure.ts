import {
  MeasureSchema,
  type Measure,
  type MeasureAmount,
  type MeasureApplication,
  type MeasureRequirements,
  type RawMeasure,
} from '../../domain/measures/model.ts';
import type { SourceDefinition } from '../../data/sources/types.ts';

function nullableAmount(amount: RawMeasure['amount']): MeasureAmount {
  return {
    type: amount?.type ?? 'UNKNOWN',
    value: amount?.value ?? null,
    min: amount?.min ?? null,
    max: amount?.max ?? null,
    currency: amount?.currency ?? null,
  };
}

function nullableRequirements(requirements: RawMeasure['requirements']): MeasureRequirements {
  return {
    iseeMax: requirements?.iseeMax ?? null,
    iseeMin: requirements?.iseeMin ?? null,
    iseeType: requirements?.iseeType ?? null,
    minAge: requirements?.minAge ?? null,
    maxAge: requirements?.maxAge ?? null,
    minChildren: requirements?.minChildren ?? null,
    childrenMaxAge: requirements?.childrenMaxAge ?? null,
    residenceRequired: requirements?.residenceRequired ?? null,
    minimumResidenceMonths: requirements?.minimumResidenceMonths ?? null,
    rentRequired: requirements?.rentRequired ?? null,
    registeredLeaseRequired: requirements?.registeredLeaseRequired ?? null,
    employmentStatus: requirements?.employmentStatus ?? null,
    disabilityRequired: requirements?.disabilityRequired ?? null,
    otherRequirements: requirements?.otherRequirements ?? [],
  };
}

function nullableApplication(application: RawMeasure['application']): MeasureApplication {
  return {
    startDate: application?.startDate ?? null,
    endDate: application?.endDate ?? null,
    deadlineDescription: application?.deadlineDescription ?? null,
    url: application?.url ?? null,
    procedure: application?.procedure ?? null,
  };
}

export interface NormalizationContext {
  source?: SourceDefinition;
  importedAt?: string | null;
  importerVersion?: string | null;
}

export function normalizeRawMeasure(raw: RawMeasure, context: NormalizationContext = {}): Measure {
  const { source } = context;
  return MeasureSchema.parse({
    id: raw.id ?? null,
    title: raw.title ?? null,
    description: raw.description ?? null,
    authority: {
      type: source?.authority.type ?? raw.authority?.type ?? null,
      name: source?.authority.name ?? raw.authority?.name ?? null,
    },
    territory: {
      region: source?.territory.region ?? raw.territory?.region ?? null,
      province: source?.territory.province ?? raw.territory?.province ?? null,
      municipality: source?.territory.municipality ?? raw.territory?.municipality ?? null,
    },
    category: raw.category ?? null,
    benefitType: raw.benefitType ?? null,
    amount: nullableAmount(raw.amount),
    requirements: nullableRequirements(raw.requirements),
    application: nullableApplication(raw.application),
    source: {
      url: raw.sourceUrl ?? null,
      sourceName: source?.authority.name ?? raw.sourceName ?? null,
      sourceType: source?.type ?? null,
      retrievedAt: raw.retrievedAt ?? null,
      lastVerifiedAt: raw.lastVerifiedAt ?? null,
      sourceDocumentDate: raw.sourceDocumentDate ?? null,
      documents: raw.sourceDocuments ?? [],
    },
    status: raw.status ?? 'UNKNOWN',
    dataQuality: raw.dataQuality ?? 'TO_VERIFY',
    recordType: raw.recordType ?? 'SAMPLE',
    unstructuredRequirements: raw.unstructuredRequirements ?? [],
    provenance: {
      importedAt: context.importedAt ?? raw.provenance?.importedAt ?? null,
      importerVersion: context.importerVersion ?? raw.provenance?.importerVersion ?? null,
      rawSourceId: source?.id ?? raw.provenance?.rawSourceId ?? null,
    },
  });
}
