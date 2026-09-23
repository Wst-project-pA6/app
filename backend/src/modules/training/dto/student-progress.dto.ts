import { IsUUID } from 'class-validator';

export class CourseIdQuery {
  @IsUUID()
  courseId!: string;
}
