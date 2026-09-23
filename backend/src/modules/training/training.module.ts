import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { SchedulingConflictModule } from '../../common/scheduling/scheduling-conflict.module';
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
import { AttendanceController } from './attendance.controller';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { PracticalTasksController } from './practical-tasks.controller';
import { PracticalTasksRepository } from './practical-tasks.repository';
import { PracticalTasksService } from './practical-tasks.service';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsRepository } from './assessments.repository';
import { AssessmentsService } from './assessments.service';
import { CompetenciesController } from './competencies.controller';
import { CompetenciesRepository } from './competencies.repository';
import { CompetenciesService } from './competencies.service';
import { EligibilityRepository } from './eligibility.repository';
import { EligibilityService } from './eligibility.service';
import { StudentProgressController } from './student-progress.controller';

@Module({
  imports: [AccessModule, AuditModule, BaysModule, SchedulingConflictModule],
  controllers: [
    TrainingTermsController,
    CoursesController,
    MentorsController,
    StudentsController,
    TrainingGroupsController,
    EnrollmentsController,
    TrainingSessionsController,
    AttendanceController,
    PracticalTasksController,
    AssessmentsController,
    CompetenciesController,
    StudentProgressController,
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
    AttendanceRepository,
    AttendanceService,
    PracticalTasksRepository,
    PracticalTasksService,
    AssessmentsRepository,
    AssessmentsService,
    CompetenciesRepository,
    CompetenciesService,
    EligibilityRepository,
    EligibilityService,
  ],
  exports: [
    TrainingTermsRepository,
    CoursesRepository,
    StudentsRepository,
    TrainingGroupsRepository,
    EnrollmentsRepository,
    TrainingSessionsRepository,
    PracticalTasksRepository,
    AssessmentsRepository,
    CompetenciesRepository,
    EligibilityService,
  ],
})
export class TrainingModule {}
