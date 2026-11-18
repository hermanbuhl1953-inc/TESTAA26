import { z } from 'zod';
import type { JsonValue } from '../eligibility/model.ts';

export const AuthorityTypeSchema = z.enum(['REGION', 'MUNICIPALITY', 'NATIONAL', 'OTHER']);
export const MeasureBenefitTypeSchema = z.enum([
  'BONUS',
  'CONTRIBUTION',
  'DISCOUNT',
  'REIMBURSEMENT',
  'SERVICE',
  'TAX_RELIEF',
  'OTHER',
]);
export const MeasureStatusSchema = z.enum(['OPEN', 'UPCOMING', 'CLOSED', 'UNKNOWN']);
export const DataQualitySchema = z.enum(['VERIFIED', 'PARTIAL', 'TO_VERIFY']);
export const RecordTypeSchema = z.enum(['DEMO', 'SAMPLE', 'REAL']);
export const SourceTypeSchema = z.enum(['OFFICIAL', 'SECONDARY']);
export const EmploymentStatusSchema = z.enum(['EMPLOYED', 'UNEMPLOYED', 'INACTIVE']);

const nullableText = z.string().nullable();
const nullableNonNegativeInteger = z.number().int().nonnegative().nullable();
const nullableDate = z.string().datetime({ offset: true }).nullable();
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]));

export const MeasureAmountSchema = z.object({
  type: z.enum(['FIXED', 'MAXIMUM', 'VARIABLE', 'UNKNOWN']),
  value: nullableNonNegativeInteger,
  min: nullableNonNegativeInteger,
  max: nullableNonNegativeInteger,
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
});

export const OtherRequirementSchema = z.object({
  code: z.string().trim().min(1),
  description: z.string().trim().min(1),
  required: z.boolean().nullable(),
  structured: z.boolean(),
  value: jsonValueSchema.nullable(),
});

export const MeasureRequirementsSchema = z.object({
  iseeMax: nullableNonNegativeInteger,
  iseeMin: nullableNonNegativeInteger,
  iseeType: nullableText,
  minAge: nullableNonNegativeInteger,
  maxAge: nullableNonNegativeInteger,
  minChildren: nullableNonNegativeInteger,
  childrenMaxAge: nullableNonNegativeInteger,
  residenceRequired: z.boolean().nullable(),
  minimumResidenceMonths: nullableNonNegativeInteger,
  rentRequired: z.boolean().nullable(),
  registeredLeaseRequired: z.boolean().nullable(),
  employmentStatus: EmploymentStatusSchema.nullable(),
  disabilityRequired: z.boolean().nullable(),
  otherRequirements: z.array(OtherRequirementSchema),
});

export const MeasureApplicationSchema = z.object({
  startDate: nullableDate,
  endDate: nullableDate,
  deadlineDescription: nullableText,
  url: z.string().nullable(),
  procedure: nullableText,
});

export const MeasureSourceSchema = z.object({
  url: z.string().nullable(),
  sourceName: nullableText,
  sourceType: SourceTypeSchema.nullable(),
  retrievedAt: nullableDate,
  lastVerifiedAt: nullableDate,
  sourceDocumentDate: nullableDate,
  documents: z.array(z.object({
    title: z.string().trim().min(1),
    url: z.string().url(),
    publishedDate: z.string().date().nullable(),
  })).default([]),
});

export const MeasureProvenanceSchema = z.object({
  importedAt: nullableDate,
  importerVersion: nullableText,
  rawSourceId: nullableText,
});

export const MeasureSchema = z.object({
  id: nullableText,
  title: nullableText,
  description: nullableText,
  authority: z.object({
    type: AuthorityTypeSchema.nullable(),
    name: nullableText,
  }),
  territory: z.object({
    region: nullableText,
    province: nullableText,
    municipality: nullableText,
  }),
  category: nullableText,
  benefitType: MeasureBenefitTypeSchema.nullable(),
  amount: MeasureAmountSchema,
  requirements: MeasureRequirementsSchema,
  application: MeasureApplicationSchema,
  source: MeasureSourceSchema,
  status: MeasureStatusSchema,
  dataQuality: DataQualitySchema,
  recordType: RecordTypeSchema,
  unstructuredRequirements: z.array(z.string().trim().min(1)),
  provenance: MeasureProvenanceSchema,
});

export type AuthorityType = z.infer<typeof AuthorityTypeSchema>;
export type MeasureBenefitType = z.infer<typeof MeasureBenefitTypeSchema>;
export type MeasureStatus = z.infer<typeof MeasureStatusSchema>;
export type DataQuality = z.infer<typeof DataQualitySchema>;
export type RecordType = z.infer<typeof RecordTypeSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type MeasureAmount = z.infer<typeof MeasureAmountSchema>;
export type MeasureRequirements = z.infer<typeof MeasureRequirementsSchema>;
export type OtherRequirement = z.infer<typeof OtherRequirementSchema>;
export type MeasureApplication = z.infer<typeof MeasureApplicationSchema>;
export type MeasureSource = z.infer<typeof MeasureSourceSchema>;
export type MeasureProvenance = z.infer<typeof MeasureProvenanceSchema>;
export type Measure = z.infer<typeof MeasureSchema>;

export const RawMeasureSchema = z.object({
  id: nullableText.optional(),
  title: nullableText.optional(),
  description: nullableText.optional(),
  authority: z.object({
    type: AuthorityTypeSchema.nullable().optional(),
    name: nullableText.optional(),
  }).partial().optional(),
  territory: z.object({
    region: nullableText.optional(),
    province: nullableText.optional(),
    municipality: nullableText.optional(),
  }).partial().optional(),
  category: nullableText.optional(),
  benefitType: MeasureBenefitTypeSchema.nullable().optional(),
  amount: MeasureAmountSchema.partial().nullable().optional(),
  requirements: MeasureRequirementsSchema.partial().nullable().optional(),
  application: MeasureApplicationSchema.partial().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  sourceName: nullableText.optional(),
  sourceDocumentDate: nullableDate.optional(),
  retrievedAt: nullableDate.optional(),
  lastVerifiedAt: nullableDate.optional(),
  status: MeasureStatusSchema.optional(),
  dataQuality: DataQualitySchema.optional(),
  recordType: RecordTypeSchema.optional(),
  sourceDocuments: MeasureSourceSchema.shape.documents.optional(),
  unstructuredRequirements: z.array(z.string()).optional(),
  provenance: MeasureProvenanceSchema.partial().nullable().optional(),
});

export type RawMeasure = z.infer<typeof RawMeasureSchema>;

export interface MeasureValidationIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  path: string;
}

export interface MeasureValidationResult {
  measureId: string | null;
  valid: boolean;
  importAllowed: boolean;
  issues: MeasureValidationIssue[];
  recommendedDataQuality: DataQuality;
}

export interface MeasureConflictResult {
  possibleDuplicate: boolean;
  sameFingerprint: boolean;
  conflictingFields: string[];
}

export type CandidateConflictType = 'EXACT_DUPLICATE' | 'POSSIBLE_UPDATE' | 'CONFLICT';

export interface CandidateConflict {
  type: CandidateConflictType;
  existingMeasureId: string | null;
  existingFingerprint: string;
  conflictingFields: string[];
}

export type CandidateReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';

export interface CandidateMeasure {
  normalizedMeasure: Measure;
  validationResult: MeasureValidationResult;
  fingerprint: string;
  contentHash: string;
  source: {
    sourceId: string;
    authorityName: string;
    sourceUrl: string | null;
    sourceType: SourceType;
  };
  ingestedAt: string;
  warnings: string[];
  conflicts: CandidateConflict[];
  reviewStatus: CandidateReviewStatus;
  approvable: boolean;
}

export const IngestionStatusSchema = z.enum(['SUCCESS', 'PARTIAL', 'FAILED', 'BLOCKED']);
export type IngestionStatus = z.infer<typeof IngestionStatusSchema>;

export interface IngestionResult {
  sourceId: string;
  startedAt: string;
  completedAt: string;
  status: IngestionStatus;
  recordsFound: number;
  recordsAccepted: number;
  recordsRejected: number;
  recordsToVerify: number;
  candidates: CandidateMeasure[];
  errors: string[];
  warnings: string[];
}
