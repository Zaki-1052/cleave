// frontend/src/api/types.ts

export interface User {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailNotifications: string;
  createdAt: string;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  createdBy: number | null;
  storageBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface Experiment {
  id: number;
  projectId: number;
  name: string;
  assayType: string;
  description: string | null;
  status: string;
  createdBy: number | null;
  creator: MemberUser | null;
  storageBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface Reaction {
  id: number;
  experimentId: number;
  fastqPrefix: string;
  shortName: string;
  organism: string;
  assayType: string;
  cutanaSpikeIn: string;
  cutanaSpikeInTarget: string | null;
  ecoliSpikeIn: boolean;
  cellType: string | null;
  cellNumber: string | null;
  samplePrep: string | null;
  experimentalCondition: string | null;
  antibodyVendor: string | null;
  antibodyCatNo: string | null;
  antibodyLotNo: string | null;
  cutanaSpikeIn2: string | null;
  cutanaSpikeInTarget2: string | null;
}

export interface PrefixInfo {
  prefix: string;
  hasR1: boolean;
  hasR2: boolean;
}

export interface CsvImportResponse {
  created: number;
  reactions: Reaction[];
  warnings: string[];
}

export interface ReactionCreatePayload {
  fastqPrefix: string;
  shortName: string;
  organism: string;
  assayType: string;
  cutanaSpikeIn?: string;
  cutanaSpikeInTarget?: string | null;
  ecoliSpikeIn?: boolean;
  cellType?: string | null;
  cellNumber?: string | null;
  samplePrep?: string | null;
  experimentalCondition?: string | null;
  antibodyVendor?: string | null;
  antibodyCatNo?: string | null;
  antibodyLotNo?: string | null;
  cutanaSpikeIn2?: string | null;
  cutanaSpikeInTarget2?: string | null;
}

export interface ReactionUpdatePayload {
  fastqPrefix?: string;
  shortName?: string;
  organism?: string;
  assayType?: string;
  cutanaSpikeIn?: string;
  cutanaSpikeInTarget?: string | null;
  ecoliSpikeIn?: boolean;
  cellType?: string | null;
  cellNumber?: string | null;
  samplePrep?: string | null;
  experimentalCondition?: string | null;
  antibodyVendor?: string | null;
  antibodyCatNo?: string | null;
  antibodyLotNo?: string | null;
  cutanaSpikeIn2?: string | null;
  cutanaSpikeInTarget2?: string | null;
}

export interface FastqFile {
  id: number;
  experimentId: number;
  filename: string;
  prefix: string;
  readDirection: string;
  fileSizeBytes: number | null;
  totalReads: number | null;
  filePath: string;
  fastqcReportPath: string | null;
  isTrimmed: boolean;
  adapterStatus: string | null;
  uploadSource: string | null;
  uploadedAt: string;
}

export interface AnalysisJob {
  id: number;
  experimentId: number;
  jobType: string;
  name: string;
  notes: string | null;
  status: string;
  params: Record<string, unknown>;
  parentJobId: number | null;
  launchedBy: number | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  methodsText: string | null;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  linkTarget: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface MemberUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface Member {
  userId: number;
  projectId: number;
  role: string;
  canDownload: boolean;
  canDelete: boolean;
  createdAt: string;
  user: MemberUser;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
}

export interface ApiError {
  error: string;
  detail: string | null;
  fieldErrors: Record<string, string> | null;
}
