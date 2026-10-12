export interface ThinkStep {
  'question-index'?: number | string;
  type?: string;
  content?: string;
  narration?: string;
  func?: string;
  func_params?: unknown[];
  [key: string]: unknown;
}
export interface ThinkFunction {
  'question-index'?: number | string;
  name: string;
  func: string;
  [key: string]: unknown;
}
export interface ThinkData {
  steps: ThinkStep[];
  func_list?: ThinkFunction[];
  [key: string]: unknown;
}
export type ReviewStatus = 'pending' | 'approved' | 'revision';
export interface ReviewDocument {
  id: string;
  name: string;
  source: string;
  data: ThinkData;
  original: ThinkData;
  status: ReviewStatus;
  note: string;
  importedAt: string;
  modifiedAt?: string;
  demo?: boolean;
  tableBinding?: {
    workbookId: string;
    sheet: string;
    row: number;
    tid: string;
    scriptTeacher: string;
    referenceRaw: string;
    finalRaw: string;
    fileId?: string;
    fileName?: string;
  };
}
export interface ImportProblem { source: string; message: string; }
export interface ImportResult { documents: ThinkData[]; errors: string[]; }
