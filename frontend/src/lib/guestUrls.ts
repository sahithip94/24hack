/**
 * Guest-share API paths on the FastAPI backend.
 * All guest data access is authorized server-side via the
 * share token plus a short-lived guest access token.
 */
export function verifyPinPath(shareToken: string): string {
  return `/sharing/access/${shareToken}/verify-pin`;
}

export function guestRecordsPath(shareToken: string): string {
  return `/sharing/access/${shareToken}/records`;
}

export function guestDocumentPath(shareToken: string, documentId: number): string {
  return `/sharing/access/${shareToken}/documents/${documentId}/file`;
}
