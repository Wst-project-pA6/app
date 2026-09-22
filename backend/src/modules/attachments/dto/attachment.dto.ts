import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsUUID } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';

export enum AttachmentPurpose {
  JOB_PHOTO = 'JOB_PHOTO',
  APPROVAL_EVIDENCE = 'APPROVAL_EVIDENCE',
  QUALITY_EVIDENCE = 'QUALITY_EVIDENCE',
  TRAINING_EVIDENCE = 'TRAINING_EVIDENCE',
}

export class AttachmentUploadDto {
  @IsEnum(AttachmentPurpose)
  purpose!: AttachmentPurpose;
}

export class JobAttachmentLinkRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  attachmentIds!: string[];
}

export class JobAttachmentListQuery extends PaginationQuery {}
