import { z } from 'zod';

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]));

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const BenefitRuleFieldSchema = z.enum([
  'region',
  'municipality',
  'iseeAmountCents',
  'iseeType',
  'adultCount',
  'childCount',
  'householdSize',
  'childAges',
  'hasMinor',
  'hasChildUnder3',
  'hasAdultOver65',
  'hasDisability',
  'hasNonSelfSufficientMember',
  'employmentStatuses',
  'housingType',
  'registeredRentalContract',
  'residenceMonths',
]);

export const BenefitRuleOperatorSchema = z.enum([
  'EQ',
  'NE',
  'LTE',
  'GTE',
  'IN',
  'BETWEEN',
  'ANY_BETWEEN',
  'ALL_BETWEEN',
  'CONTAINS',
]);

export const BenefitRuleSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  field: BenefitRuleFieldSchema,
  operator: BenefitRuleOperatorSchema,
  expectedValue: jsonValueSchema,
  required: z.boolean().default(true),
});

export const BenefitSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  opensAt: z.date().nullable().default(null),
  closesAt: z.date().nullable().default(null),
  rules: z.array(BenefitRuleSchema),
});

export const HouseholdMemberSchema = z.object({
  role: z.enum(['ADULT', 'CHILD']),
  ageYears: z.number().int().min(0).max(130).optional(),
  hasDisability: z.boolean().optional(),
  isNonSelfSufficient: z.boolean().optional(),
  employmentStatus: z.enum(['EMPLOYED', 'UNEMPLOYED', 'INACTIVE']).optional(),
});

export const HouseholdProfileSchema = z.object({
  region: z.string().min(1).optional(),
  municipality: z.string().min(1).optional(),
  iseeAmountCents: z.number().int().nonnegative().optional(),
  iseeType: z.string().min(1).optional(),
  adultCount: z.number().int().nonnegative().optional(),
  childCount: z.number().int().nonnegative().optional(),
  members: z.array(HouseholdMemberSchema).optional(),
  housingType: z.enum(['RENT', 'OWNED', 'OTHER']).optional(),
  registeredRentalContract: z.boolean().optional(),
  residenceMonths: z.number().int().nonnegative().optional(),
}).superRefine((profile, context) => {
  if (!profile.members) return;
  const adultCount = profile.members.filter((member) => member.role === 'ADULT').length;
  const childCount = profile.members.filter((member) => member.role === 'CHILD').length;
  if (profile.adultCount !== undefined && profile.adultCount !== adultCount) {
    context.addIssue({ code: 'custom', path: ['adultCount'], message: 'Il numero di adulti non coincide con i componenti elencati.' });
  }
  if (profile.childCount !== undefined && profile.childCount !== childCount) {
    context.addIssue({ code: 'custom', path: ['childCount'], message: 'Il numero di figli non coincide con i componenti elencati.' });
  }
});

export type BenefitRule = z.infer<typeof BenefitRuleSchema>;
export type Benefit = z.infer<typeof BenefitSchema>;
export type HouseholdMember = z.infer<typeof HouseholdMemberSchema>;
export type HouseholdProfile = z.infer<typeof HouseholdProfileSchema>;

export const RuleStatusSchema = z.enum(['PASS', 'FAIL', 'MISSING', 'NOT_APPLICABLE']);
export type RuleStatus = z.infer<typeof RuleStatusSchema>;

export const EligibilityStatusSchema = z.enum([
  'ELIGIBLE',
  'LIKELY',
  'NEEDS_DATA',
  'NOT_ELIGIBLE',
  'EXPIRED',
]);
export type EligibilityStatus = z.infer<typeof EligibilityStatusSchema>;

export interface RuleResult {
  rule: BenefitRule;
  expectedValue: JsonValue;
  actualValue: JsonValue | null;
  status: RuleStatus;
  message: string;
}

export interface BenefitEvaluation {
  benefitCode: string;
  status: EligibilityStatus;
  message: string;
  evaluatedAt: Date;
  rules: RuleResult[];
}
