import { getGuestToken, getToken, fetchFileAsObjectUrl } from './api';

/**
 * Open one of the signed-in patient's original document files.
 * The bearer token cannot ride a plain navigation request, so the
 * file is fetched as an authenticated blob and opened via a
 * temporary object URL. Callers should revoke the URL after use.
 */
export async function openPatientDocument(
  documentId: number,
): Promise<string> {
  const token = getToken();
  if (!token) {
    throw new Error('You must be signed in to open files.');
  }
  return fetchFileAsObjectUrl(`/documents/${documentId}/file`, token);
}

/**
 * Open one of the signed-in patient's document files in a new browser tab.
 *
 * The file must be fetched with the bearer token first. Calling
 * `window.open()` after that `await` gets pop-up-blocked because the click's
 * user gesture has expired (the button appears to do nothing). Instead we
 * create an anchor with `target="_blank"` and click it — a link navigation
 * that bypasses the pop-up blocker — then release the object URL once the
 * viewer has had time to load it.
 */
export async function openPatientDocumentInNewTab(
  documentId: number,
): Promise<void> {
  const objectUrl = await openPatientDocument(documentId);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  // Keep the element in the layout (off-screen) — some browsers ignore
  // clicks on display:none anchors.
  anchor.style.position = 'fixed';
  anchor.style.left = '-9999px';
  anchor.style.top = '0';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the viewer time to load before releasing the object URL.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60_000);
}

/**
 * Open a document authorized by a guest share. Uses the guest
 * access token for this share only; the backend verifies the
 * document is part of the share on every request.
 */
export async function openGuestDocument(
  shareToken: string,
  documentId: number,
): Promise<string> {
  const guestToken = getGuestToken(shareToken);
  if (!guestToken) {
    throw new Error('Guest verification is required to open files.');
  }
  return fetchFileAsObjectUrl(
    `/sharing/access/${shareToken}/documents/${documentId}/file`,
    guestToken,
  );
}

/** Download helper: fetch as blob and trigger a save dialog. */
export async function downloadPatientDocument(
  documentId: number,
  filename: string,
): Promise<void> {
  const url = await openPatientDocument(documentId);
  triggerDownload(url, filename);
}

function triggerDownload(objectUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Release the object URL shortly after the download starts.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
