/** Shapes returned by the FastAPI "Lost in Transit" backend. */

export interface PatientUser {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export interface PatientRecord {
  record_id: number;
  document_id: number | null;
  category: string;
  title: string;
  event_date: string | null;
  details: string;
  verified: boolean;
  created_at: string;
}

export interface DocumentInfo {
  document_id: number;
  filename: string;
  content_type: string;
  uploaded_at: string;
  status: string;
  processing_note: string | null;
}

export interface DocumentUploadResponse {
  document_id: number;
  filename: string;
  status: string;
  processing_note: string | null;
  message: string;
}

export interface ExtractionCandidateFields {
  candidate_category: string;
  candidate_title: string;
  candidate_event_date: string | null;
  text_preview: string;
  text_character_count: number;
  requires_patient_verification: boolean;
}

export interface ExtractionResponse {
  document_id: number;
  status: string;
  candidate_fields: ExtractionCandidateFields;
  extracted_text: string;
  processing_note: string | null;
  instruction: string;
}

export interface RepeatTestAlert {
  type: 'possible_repeat_test';
  record_ids: number[];
  title: string;
  dates: string[];
  message: string;
}

export interface RepeatTestAlertsResponse {
  count: number;
  alerts: RepeatTestAlert[];
}

export interface SummaryResponse {
  summary_id: number;
  summary_text: string;
  source_record_ids: number[];
  model_used: string;
  created_at: string;
  notice: string;
}

export interface SummaryHistoryEntry extends SummaryResponse {}

export interface CreatedShare {
  share_id: number;
  share_url: string;
  share_token: string;
  access_pin: string;
  expires_at: string;
  record_ids: number[];
  important: string;
}

export interface ShareLinkInfo {
  share_id: number;
  record_ids: number[];
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  status: 'active' | 'expired' | 'revoked';
}

export interface GuestRecordsResponse {
  share_id: number;
  expires_at: string;
  records: PatientRecord[];
  notice: string;
}

export interface VerifyPinResponse {
  guest_access_token: string;
  token_type: string;
  expires_in_seconds: number;
  message: string;
}

export interface AuditLogEntry {
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string | null;
  timestamp: string;
}

export interface OcrExtractResponse {
  text: string;
  character_count: number;
  line_count: number;
  language: string;
  engine: string;
  filename: string;
  notice: string;
  /** Present when the source was a scanned PDF that was OCR'd page-by-page. */
  page_count?: number;
  pages_with_text?: number;
}

export interface SummaryFromTextResponse {
  summary_text: string;
  model_used: string;
  notice: string;
}
