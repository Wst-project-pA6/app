/**
 * Smallest storage abstraction that keeps attachment bytes out of application code.
 * `key` is a server-generated, non-guessable identifier — never a user-controlled file name.
 * This interface is deliberately storage-only (put/get/remove): building and signing a
 * download URL is an application-layer concern (it needs to know this API's own route and
 * host), not something a storage adapter should decide — see
 * `modules/attachments/download-token.util.ts` and `AttachmentsService.authorizeDownload`.
 */
export interface AttachmentStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');
