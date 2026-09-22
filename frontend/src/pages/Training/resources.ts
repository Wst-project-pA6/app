import type { TrainingOperation } from '@/api/endpoints/training'

export interface TrainingResource {
  list: TrainingOperation
  create?: TrainingOperation
  update?: TrainingOperation
  detail?: TrainingOperation
  columns: string[]
  idParam?: string
}
export const trainingResources: Record<string, TrainingResource> = {
  terms: {
    list: 'listTrainingTerms',
    create: 'createTrainingTerm',
    update: 'updateTrainingTerm',
    idParam: 'termId',
    columns: ['name', 'startDate', 'endDate', 'status'],
  },
  courses: {
    list: 'listCourses',
    create: 'createCourse',
    update: 'updateCourse',
    idParam: 'courseId',
    columns: ['code', 'name', 'termId', 'status'],
  },
  mentors: { list: 'listMentors', columns: ['displayName', 'id'] },
  students: {
    list: 'listStudents',
    create: 'createStudent',
    update: 'updateStudent',
    detail: 'getStudent',
    idParam: 'studentId',
    columns: ['studentNumber', 'displayName', 'status'],
  },
  groups: {
    list: 'listTrainingGroups',
    create: 'createTrainingGroup',
    update: 'updateTrainingGroup',
    idParam: 'groupId',
    columns: ['name', 'courseId', 'enrolledCount', 'status'],
  },
  enrollments: {
    list: 'listEnrollments',
    create: 'createEnrollment',
    update: 'updateEnrollment',
    idParam: 'enrollmentId',
    columns: ['studentId', 'courseId', 'status', 'enrolledAt'],
  },
  sessions: {
    list: 'listTrainingSessions',
    create: 'createTrainingSession',
    update: 'updateTrainingSession',
    detail: 'getTrainingSession',
    idParam: 'sessionId',
    columns: ['title', 'startsAt', 'endsAt', 'mentorId', 'bayId', 'status'],
  },
  calendar: {
    list: 'listTrainingSessions',
    detail: 'getTrainingSession',
    idParam: 'sessionId',
    columns: ['startsAt', 'endsAt', 'title', 'groupId', 'mentorId', 'bayId', 'status'],
  },
  attendance: { list: 'listAttendanceRecords', columns: ['sessionId', 'studentId', 'status', 'note'] },
  tasks: {
    list: 'listPracticalTasks',
    create: 'createPracticalTask',
    update: 'updatePracticalTask',
    idParam: 'taskId',
    columns: ['code', 'title', 'competencyId', 'expectedMinutes', 'status'],
  },
  assessments: {
    list: 'listAssessments',
    create: 'createAssessment',
    update: 'updateAssessment',
    idParam: 'assessmentId',
    columns: ['studentId', 'taskId', 'result', 'signOffStatus', 'countsTowardCompletion'],
  },
  competencies: {
    list: 'listCompetencies',
    create: 'createCompetency',
    update: 'updateCompetency',
    idParam: 'competencyId',
    columns: ['code', 'name', 'status'],
  },
  certificates: {
    list: 'listCertificates',
    create: 'issueCertificate',
    detail: 'getCertificate',
    idParam: 'certificateId',
    columns: ['certificateNumber', 'studentId', 'courseId', 'status', 'issuedAt'],
  },
}

export const workflowOperations: Record<string, TrainingOperation[]> = {
  conflicts: ['checkTrainingSessionConflicts', 'createConflictOverrides'],
  transitions: ['transitionTrainingSession'],
  'record-attendance': ['recordSessionAttendance'],
  'sign-off': ['signOffAssessment'],
  revoke: ['revokeCertificate'],
}
