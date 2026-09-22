import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AttachmentUploadDto, JobAttachmentLinkRequest } from './attachment.dto';

describe('attachment DTO validation', () => {
  it('accepts a known purpose and rejects an unknown one', async () => {
    const valid = plainToInstance(AttachmentUploadDto, { purpose: 'JOB_PHOTO' });
    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);

    const invalid = plainToInstance(AttachmentUploadDto, { purpose: 'SELFIE' });
    expect((await validate(invalid)).length).toBeGreaterThan(0);
  });

  it('requires 1-10 distinct UUIDs to link', async () => {
    const valid = plainToInstance(JobAttachmentLinkRequest, {
      attachmentIds: ['11111111-1111-4111-8111-111111111111'],
    });
    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);

    const empty = plainToInstance(JobAttachmentLinkRequest, { attachmentIds: [] });
    expect((await validate(empty)).length).toBeGreaterThan(0);

    const tooMany = plainToInstance(JobAttachmentLinkRequest, {
      attachmentIds: Array.from({ length: 11 }, (_, i) => `11111111-1111-4111-8111-11111111111${i.toString(16)}`),
    });
    expect((await validate(tooMany)).length).toBeGreaterThan(0);

    const duplicates = plainToInstance(JobAttachmentLinkRequest, {
      attachmentIds: ['11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'],
    });
    expect((await validate(duplicates)).length).toBeGreaterThan(0);

    const notUuid = plainToInstance(JobAttachmentLinkRequest, { attachmentIds: ['not-a-uuid'] });
    expect((await validate(notUuid)).length).toBeGreaterThan(0);
  });
});
