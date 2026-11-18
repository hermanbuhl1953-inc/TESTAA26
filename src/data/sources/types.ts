import type { AuthorityType, SourceType } from '../../domain/measures/model.ts';

export interface SourceDefinition {
  id: string;
  authority: {
    type: AuthorityType;
    name: string;
  };
  territory: {
    region: string | null;
    province: string | null;
    municipality: string | null;
  };
  baseUrl: string;
  type: SourceType;
  enabled: boolean;
  lastChecked: string | null;
}
