import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { BaysModule } from '../bays/bays.module';
import { TrainingTermsController } from './training-terms.controller';
import { TrainingTermsRepository } from './training-terms.repository';
import { TrainingTermsService } from './training-terms.service';
import { CoursesController } from './courses.controller';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { MentorsController } from './mentors.controller';
import { MentorsRepository } from './mentors.repository';
import { MentorsService } from './mentors.service';
import { StudentsController } from './students.controller';
import { StudentsRepository } from './students.repository';
import { StudentsService } from './students.service';
import { TrainingGroupsController } from './training-groups.controller';
import { TrainingGroupsRepository } from './training-groups.repository';
import { TrainingGroupsService } from './training-groups.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsRepository } from './enrollments.repository';
import { EnrollmentsService } from './enrollments.service';
import { TrainingSessionsController } from './training-sessions.controller';
import { TrainingSessionsRepository } from './training-sessions.repository';
import { TrainingSessionsService } from './training-sessions.service';

@Module({
  imports: [AccessModule, AuditModule, BaysModule],
  controllers: [
    TrainingTermsController,
    CoursesController,
    MentorsController,
    StudentsController,
    TrainingGroupsController,
    EnrollmentsController,
    TrainingSessionsController,
  ],
  providers: [
    TrainingTermsRepository,
    TrainingTermsService,
    CoursesRepository,
    CoursesService,
    MentorsRepository,
    MentorsService,
    StudentsRepository,
    StudentsService,
    TrainingGroupsRepository,
    TrainingGroupsService,
    EnrollmentsRepository,
    EnrollmentsService,
    TrainingSessionsRepository,
    TrainingSessionsService,
  ],
  exports: [
    TrainingTermsRepository,
    CoursesRepository,
    StudentsRepository,
    TrainingGroupsRepository,
    EnrollmentsRepository,
    TrainingSessionsRepository,
  ],
})
export class TrainingModule {}
