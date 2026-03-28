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
  launcher: MemberUser | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  methodsText: string | null;
  createdAt: string;
}

export interface QueueJob {
  id: number;
  experimentId: number;
  experimentName: string;
  projectId: number;
  projectName: string;
  jobType: string;
  name: string;
  status: string;
  launchedBy: number | null;
  launcher: MemberUser | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface JobOutput {
  id: number;
  jobId: number;
  reactionId: number | null;
  fileCategory: string;
  filename: string;
  filePath: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

export interface AlignmentReactionMetrics {
  shortName: string;
  totalReadPairs: number;
  alignedReadPairs: number;
  uniquelyAlignedReadPairs: number;
  uniqueAlignmentRate: number;
  duplicationRate: number;
  chrmBandwidth: number;
  ecoliReadPairs: number;
  ecoliAlignmentRate: number;
  ecoliNormalizationFactor: number;
}

export interface SpikeInPTMResult {
  ptmName: string;
  rawCount: number;
  pctRecovery: number;
}

export interface SpikeInReactionResult {
  shortName: string;
  onTargetPtm: string | null;
  totalBarcodeReads: number;
  ptmResults: SpikeInPTMResult[];
}

export interface AlignmentQCReport {
  referenceGenome: string;
  metrics: AlignmentReactionMetrics[];
  spikeInResults: SpikeInReactionResult[] | null;
}

export interface PeakCallingReactionMetrics {
  shortName: string;
  controlShortName: string;
  referenceGenome: string;
  peakCaller: string;
  peakSize: string;
  significanceThreshold: number;
  uniquelyAlignedReadPairs: number;
  calledPeaks: number;
  readsInPeaks: number;
  frip: number;
}

export interface TopCalledPeak {
  shortName: string;
  controlShortName: string;
  referenceGenome: string;
  peakCaller: string;
  peakSize: string;
  significanceThreshold: number;
  topPeaks: string[];
}

export interface PeakAnnotationResult {
  shortName: string;
  categories: Record<string, number>;
}

export interface PeakCallingQCReport {
  referenceGenome: string;
  peakCaller: string;
  peakSize: string;
  metrics: PeakCallingReactionMetrics[];
  topPeaks: TopCalledPeak[] | null;
  annotations: PeakAnnotationResult[] | null;
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

export interface FileNode {
  name: string;
  path: string;
  type: string;
  size: number | null;
  children: FileNode[] | null;
}

export interface FileTreeResponse {
  root: FileNode;
  totalFiles: number;
  totalSize: number;
}
