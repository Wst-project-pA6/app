/**
 * Minimal shape of a multer-parsed multipart file. Defined locally because this project has
 * no `@types/multer` package and multer's default (no storage configured) is in-memory,
 * which is all the fields below describe.
 */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
