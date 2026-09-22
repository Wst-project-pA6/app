// Derived from openapi/wst-openapi.yaml by scripts/training-contract.mjs.
// Static form/display metadata only; all records and business results come from the API.
export const trainingContract = {
  listTrainingTerms: {
    path: '/training-terms',
    method: 'GET',
    permissions: ['training.read'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        status: {
          type: 'string',
          enum: ['PLANNED', 'ACTIVE', 'CLOSED'],
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              organizationScopeId: {
                type: 'string',
                format: 'uuid',
              },
              name: {
                type: 'string',
                maxLength: 120,
              },
              startDate: {
                type: 'string',
                format: 'date',
              },
              endDate: {
                type: 'string',
                format: 'date',
              },
              status: {
                type: 'string',
                enum: ['PLANNED', 'ACTIVE', 'CLOSED'],
              },
            },
            required: [
              'id',
              'createdAt',
              'updatedAt',
              'createdBy',
              'updatedBy',
              'organizationScopeId',
              'name',
              'startDate',
              'endDate',
              'status',
            ],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  createTrainingTerm: {
    path: '/training-terms',
    method: 'POST',
    permissions: ['training.manage'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['organizationScopeId', 'name', 'startDate', 'endDate'],
      properties: {
        organizationScopeId: {
          type: 'string',
          format: 'uuid',
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
        },
        startDate: {
          type: 'string',
          format: 'date',
        },
        endDate: {
          type: 'string',
          format: 'date',
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        organizationScopeId: {
          type: 'string',
          format: 'uuid',
        },
        name: {
          type: 'string',
          maxLength: 120,
        },
        startDate: {
          type: 'string',
          format: 'date',
        },
        endDate: {
          type: 'string',
          format: 'date',
        },
        status: {
          type: 'string',
          enum: ['PLANNED', 'ACTIVE', 'CLOSED'],
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'organizationScopeId',
        'name',
        'startDate',
        'endDate',
        'status',
      ],
    },
  },
  updateTrainingTerm: {
    path: '/training-terms/{termId}',
    method: 'PATCH',
    permissions: ['training.manage'],
    pathParams: ['termId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
        },
        startDate: {
          type: 'string',
          format: 'date',
        },
        endDate: {
          type: 'string',
          format: 'date',
        },
        status: {
          type: 'string',
          enum: ['PLANNED', 'ACTIVE', 'CLOSED'],
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        organizationScopeId: {
          type: 'string',
          format: 'uuid',
        },
        name: {
          type: 'string',
          maxLength: 120,
        },
        startDate: {
          type: 'string',
          format: 'date',
        },
        endDate: {
          type: 'string',
          format: 'date',
        },
        status: {
          type: 'string',
          enum: ['PLANNED', 'ACTIVE', 'CLOSED'],
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'organizationScopeId',
        'name',
        'startDate',
        'endDate',
        'status',
      ],
    },
  },
  listCourses: {
    path: '/courses',
    method: 'GET',
    permissions: ['training.read', 'students.self'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        q: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
        termId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              organizationScopeId: {
                type: 'string',
                format: 'uuid',
              },
              code: {
                type: 'string',
                minLength: 1,
                maxLength: 30,
              },
              name: {
                type: 'object',
                required: ['en'],
                properties: {
                  en: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 200,
                  },
                  ar: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 200,
                  },
                },
              },
              termId: {
                type: 'string',
                format: 'uuid',
              },
              description: {
                type: 'string',
                maxLength: 2000,
              },
              tasks: {
                type: 'array',
                maxItems: 200,
                items: {
                  type: 'object',
                  required: ['taskId', 'required'],
                  properties: {
                    taskId: {
                      type: 'string',
                      format: 'uuid',
                    },
                    required: {
                      type: 'boolean',
                    },
                  },
                },
              },
              minimumAttendancePercent: {
                type: 'integer',
                minimum: 0,
                maximum: 100,
              },
              status: {
                type: 'string',
                enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
              },
            },
            required: [
              'id',
              'createdAt',
              'updatedAt',
              'createdBy',
              'updatedBy',
              'organizationScopeId',
              'code',
              'name',
              'termId',
              'tasks',
              'minimumAttendancePercent',
              'status',
            ],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  createCourse: {
    path: '/courses',
    method: 'POST',
    permissions: ['training.manage'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['organizationScopeId', 'code', 'name', 'termId', 'tasks', 'minimumAttendancePercent'],
      properties: {
        organizationScopeId: {
          type: 'string',
          format: 'uuid',
        },
        code: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        name: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        termId: {
          type: 'string',
          format: 'uuid',
        },
        description: {
          type: 'string',
          maxLength: 2000,
        },
        tasks: {
          type: 'array',
          maxItems: 200,
          items: {
            type: 'object',
            required: ['taskId', 'required'],
            properties: {
              taskId: {
                type: 'string',
                format: 'uuid',
              },
              required: {
                type: 'boolean',
              },
            },
          },
        },
        minimumAttendancePercent: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        organizationScopeId: {
          type: 'string',
          format: 'uuid',
        },
        code: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        name: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        termId: {
          type: 'string',
          format: 'uuid',
        },
        description: {
          type: 'string',
          maxLength: 2000,
        },
        tasks: {
          type: 'array',
          maxItems: 200,
          items: {
            type: 'object',
            required: ['taskId', 'required'],
            properties: {
              taskId: {
                type: 'string',
                format: 'uuid',
              },
              required: {
                type: 'boolean',
              },
            },
          },
        },
        minimumAttendancePercent: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'organizationScopeId',
        'code',
        'name',
        'termId',
        'tasks',
        'minimumAttendancePercent',
        'status',
      ],
    },
  },
  updateCourse: {
    path: '/courses/{courseId}',
    method: 'PATCH',
    permissions: ['training.manage'],
    pathParams: ['courseId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      properties: {
        name: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        description: {
          type: 'string',
          maxLength: 2000,
        },
        tasks: {
          type: 'array',
          maxItems: 200,
          items: {
            type: 'object',
            required: ['taskId', 'required'],
            properties: {
              taskId: {
                type: 'string',
                format: 'uuid',
              },
              required: {
                type: 'boolean',
              },
            },
          },
        },
        minimumAttendancePercent: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        organizationScopeId: {
          type: 'string',
          format: 'uuid',
        },
        code: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        name: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        termId: {
          type: 'string',
          format: 'uuid',
        },
        description: {
          type: 'string',
          maxLength: 2000,
        },
        tasks: {
          type: 'array',
          maxItems: 200,
          items: {
            type: 'object',
            required: ['taskId', 'required'],
            properties: {
              taskId: {
                type: 'string',
                format: 'uuid',
              },
              required: {
                type: 'boolean',
              },
            },
          },
        },
        minimumAttendancePercent: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'organizationScopeId',
        'code',
        'name',
        'termId',
        'tasks',
        'minimumAttendancePercent',
        'status',
      ],
    },
  },
  listMentors: {
    path: '/mentors',
    method: 'GET',
    permissions: ['training.read'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        q: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'displayName'],
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              displayName: {
                type: 'string',
              },
            },
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  listStudents: {
    path: '/students',
    method: 'GET',
    permissions: ['training.read'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        q: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'INACTIVE'],
        },
        groupId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              userId: {
                type: 'string',
                format: 'uuid',
              },
              studentNumber: {
                type: 'string',
                minLength: 1,
                maxLength: 30,
              },
              displayName: {
                type: 'string',
              },
              status: {
                type: 'string',
                enum: ['ACTIVE', 'INACTIVE'],
              },
            },
            required: [
              'id',
              'createdAt',
              'updatedAt',
              'createdBy',
              'updatedBy',
              'userId',
              'studentNumber',
              'displayName',
              'status',
            ],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  createStudent: {
    path: '/students',
    method: 'POST',
    permissions: ['training.manage'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['userId', 'studentNumber'],
      properties: {
        userId: {
          type: 'string',
          format: 'uuid',
        },
        studentNumber: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        userId: {
          type: 'string',
          format: 'uuid',
        },
        studentNumber: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        displayName: {
          type: 'string',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'INACTIVE'],
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'userId',
        'studentNumber',
        'displayName',
        'status',
      ],
    },
  },
  getStudent: {
    path: '/students/{studentId}',
    method: 'GET',
    permissions: ['training.read', 'students.self'],
    pathParams: ['studentId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        userId: {
          type: 'string',
          format: 'uuid',
        },
        studentNumber: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        displayName: {
          type: 'string',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'INACTIVE'],
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'userId',
        'studentNumber',
        'displayName',
        'status',
      ],
    },
  },
  updateStudent: {
    path: '/students/{studentId}',
    method: 'PATCH',
    permissions: ['training.manage'],
    pathParams: ['studentId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      properties: {
        studentNumber: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'INACTIVE'],
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        userId: {
          type: 'string',
          format: 'uuid',
        },
        studentNumber: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        displayName: {
          type: 'string',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'INACTIVE'],
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'userId',
        'studentNumber',
        'displayName',
        'status',
      ],
    },
  },
  getCompetencyCoverage: {
    path: '/students/{studentId}/competency-coverage',
    method: 'GET',
    permissions: ['training.read', 'students.self'],
    pathParams: ['studentId'],
    query: {
      type: 'object',
      properties: {
        courseId: {
          type: 'string',
          format: 'uuid',
        },
      },
      required: ['courseId'],
    },
    response: {
      type: 'object',
      required: ['studentId', 'courseId', 'overallPercent', 'competencies', 'generatedAt'],
      properties: {
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        overallPercent: {
          type: 'string',
          pattern: '^-?[0-9]+(\\.[0-9]+)?$',
        },
        competencies: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'competencyId',
              'code',
              'name',
              'requiredTasks',
              'signedPassedRequiredTasks',
              'pendingUnsignedTasks',
              'coveragePercent',
            ],
            properties: {
              competencyId: {
                type: 'string',
                format: 'uuid',
              },
              code: {
                type: 'string',
              },
              name: {
                type: 'object',
                required: ['en'],
                properties: {
                  en: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 200,
                  },
                  ar: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 200,
                  },
                },
              },
              requiredTasks: {
                type: 'integer',
                minimum: 0,
              },
              signedPassedRequiredTasks: {
                type: 'integer',
                minimum: 0,
              },
              pendingUnsignedTasks: {
                type: 'integer',
                minimum: 0,
              },
              coveragePercent: {
                type: 'string',
                pattern: '^-?[0-9]+(\\.[0-9]+)?$',
              },
            },
          },
        },
        generatedAt: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
  },
  getCompletionEligibility: {
    path: '/students/{studentId}/completion-eligibility',
    method: 'GET',
    permissions: ['training.read', 'students.self'],
    pathParams: ['studentId'],
    query: {
      type: 'object',
      properties: {
        courseId: {
          type: 'string',
          format: 'uuid',
        },
      },
      required: ['courseId'],
    },
    response: {
      type: 'object',
      required: [
        'studentId',
        'courseId',
        'eligible',
        'attendancePercent',
        'minimumAttendancePercent',
        'unmetConditions',
        'evaluatedAt',
      ],
      properties: {
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        eligible: {
          type: 'boolean',
        },
        attendancePercent: {
          type: 'string',
          pattern: '^-?[0-9]+(\\.[0-9]+)?$',
        },
        minimumAttendancePercent: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
        },
        unmetConditions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                enum: [
                  'ENROLLMENT_NOT_ACTIVE',
                  'ATTENDANCE_BELOW_MINIMUM',
                  'REQUIRED_TASK_NOT_PASSED',
                  'ASSESSMENT_UNSIGNED',
                  'CERTIFICATE_ALREADY_ISSUED',
                ],
              },
              message: {
                type: 'string',
              },
              taskId: {
                type: 'string',
                format: 'uuid',
              },
            },
          },
        },
        evaluatedAt: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
  },
  listTrainingGroups: {
    path: '/training-groups',
    method: 'GET',
    permissions: ['training.read'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'CLOSED'],
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              name: {
                type: 'string',
                maxLength: 120,
              },
              courseId: {
                type: 'string',
                format: 'uuid',
              },
              status: {
                type: 'string',
                enum: ['ACTIVE', 'CLOSED'],
              },
              enrolledCount: {
                type: 'integer',
                minimum: 0,
              },
            },
            required: [
              'id',
              'createdAt',
              'updatedAt',
              'createdBy',
              'updatedBy',
              'name',
              'courseId',
              'status',
              'enrolledCount',
            ],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  createTrainingGroup: {
    path: '/training-groups',
    method: 'POST',
    permissions: ['training.manage'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['name', 'courseId'],
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        name: {
          type: 'string',
          maxLength: 120,
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'CLOSED'],
        },
        enrolledCount: {
          type: 'integer',
          minimum: 0,
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'name',
        'courseId',
        'status',
        'enrolledCount',
      ],
    },
  },
  updateTrainingGroup: {
    path: '/training-groups/{groupId}',
    method: 'PATCH',
    permissions: ['training.manage'],
    pathParams: ['groupId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'CLOSED'],
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        name: {
          type: 'string',
          maxLength: 120,
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'CLOSED'],
        },
        enrolledCount: {
          type: 'integer',
          minimum: 0,
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'name',
        'courseId',
        'status',
        'enrolledCount',
      ],
    },
  },
  listEnrollments: {
    path: '/training-groups/{groupId}/enrollments',
    method: 'GET',
    permissions: ['training.read'],
    pathParams: ['groupId'],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'WITHDRAWN', 'COMPLETED'],
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              groupId: {
                type: 'string',
                format: 'uuid',
              },
              courseId: {
                type: 'string',
                format: 'uuid',
              },
              studentId: {
                type: 'string',
                format: 'uuid',
              },
              status: {
                type: 'string',
                enum: ['ACTIVE', 'WITHDRAWN', 'COMPLETED'],
              },
              enrolledAt: {
                type: 'string',
                format: 'date-time',
              },
              withdrawnAt: {
                type: 'string',
                format: 'date-time',
              },
              withdrawalReason: {
                type: 'string',
              },
            },
            required: [
              'id',
              'createdAt',
              'updatedAt',
              'createdBy',
              'updatedBy',
              'groupId',
              'courseId',
              'studentId',
              'status',
              'enrolledAt',
            ],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  createEnrollment: {
    path: '/training-groups/{groupId}/enrollments',
    method: 'POST',
    permissions: ['training.manage'],
    pathParams: ['groupId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['studentId'],
      properties: {
        studentId: {
          type: 'string',
          format: 'uuid',
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        groupId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'WITHDRAWN', 'COMPLETED'],
        },
        enrolledAt: {
          type: 'string',
          format: 'date-time',
        },
        withdrawnAt: {
          type: 'string',
          format: 'date-time',
        },
        withdrawalReason: {
          type: 'string',
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'groupId',
        'courseId',
        'studentId',
        'status',
        'enrolledAt',
      ],
    },
  },
  updateEnrollment: {
    path: '/enrollments/{enrollmentId}',
    method: 'PATCH',
    permissions: ['training.manage'],
    pathParams: ['enrollmentId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['status', 'reason'],
      properties: {
        status: {
          type: 'string',
          enum: ['WITHDRAWN'],
        },
        reason: {
          type: 'string',
          minLength: 3,
          maxLength: 500,
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        groupId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'WITHDRAWN', 'COMPLETED'],
        },
        enrolledAt: {
          type: 'string',
          format: 'date-time',
        },
        withdrawnAt: {
          type: 'string',
          format: 'date-time',
        },
        withdrawalReason: {
          type: 'string',
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'groupId',
        'courseId',
        'studentId',
        'status',
        'enrolledAt',
      ],
    },
  },
  listTrainingSessions: {
    path: '/training-sessions',
    method: 'GET',
    permissions: ['training.read', 'students.self'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        from: {
          type: 'string',
          format: 'date-time',
        },
        to: {
          type: 'string',
          format: 'date-time',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        termId: {
          type: 'string',
          format: 'uuid',
        },
        groupId: {
          type: 'string',
          format: 'uuid',
        },
        bayId: {
          type: 'string',
          format: 'uuid',
        },
        mentorId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'],
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              title: {
                type: 'string',
                maxLength: 160,
              },
              courseId: {
                type: 'string',
                format: 'uuid',
              },
              groupId: {
                type: 'string',
                format: 'uuid',
              },
              bayId: {
                type: 'string',
                format: 'uuid',
              },
              mentorId: {
                type: 'string',
                format: 'uuid',
              },
              startsAt: {
                type: 'string',
                format: 'date-time',
              },
              endsAt: {
                type: 'string',
                format: 'date-time',
              },
              status: {
                type: 'string',
                enum: ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'],
              },
              cancellationReason: {
                type: 'string',
              },
              activeConflictOverrideCount: {
                type: 'integer',
                minimum: 0,
              },
              version: {
                type: 'integer',
                minimum: 1,
              },
            },
            required: [
              'id',
              'createdAt',
              'updatedAt',
              'createdBy',
              'updatedBy',
              'title',
              'courseId',
              'groupId',
              'bayId',
              'mentorId',
              'startsAt',
              'endsAt',
              'status',
              'version',
            ],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  createTrainingSession: {
    path: '/training-sessions',
    method: 'POST',
    permissions: ['training.manage'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['title', 'courseId', 'groupId', 'bayId', 'mentorId', 'startsAt', 'endsAt'],
      properties: {
        title: {
          type: 'string',
          minLength: 1,
          maxLength: 160,
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        groupId: {
          type: 'string',
          format: 'uuid',
        },
        bayId: {
          type: 'string',
          format: 'uuid',
        },
        mentorId: {
          type: 'string',
          format: 'uuid',
        },
        startsAt: {
          type: 'string',
          format: 'date-time',
        },
        endsAt: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        title: {
          type: 'string',
          maxLength: 160,
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        groupId: {
          type: 'string',
          format: 'uuid',
        },
        bayId: {
          type: 'string',
          format: 'uuid',
        },
        mentorId: {
          type: 'string',
          format: 'uuid',
        },
        startsAt: {
          type: 'string',
          format: 'date-time',
        },
        endsAt: {
          type: 'string',
          format: 'date-time',
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'],
        },
        cancellationReason: {
          type: 'string',
        },
        activeConflictOverrideCount: {
          type: 'integer',
          minimum: 0,
        },
        version: {
          type: 'integer',
          minimum: 1,
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'title',
        'courseId',
        'groupId',
        'bayId',
        'mentorId',
        'startsAt',
        'endsAt',
        'status',
        'version',
      ],
    },
  },
  getTrainingSession: {
    path: '/training-sessions/{sessionId}',
    method: 'GET',
    permissions: ['training.read', 'students.self'],
    pathParams: ['sessionId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        title: {
          type: 'string',
          maxLength: 160,
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        groupId: {
          type: 'string',
          format: 'uuid',
        },
        bayId: {
          type: 'string',
          format: 'uuid',
        },
        mentorId: {
          type: 'string',
          format: 'uuid',
        },
        startsAt: {
          type: 'string',
          format: 'date-time',
        },
        endsAt: {
          type: 'string',
          format: 'date-time',
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'],
        },
        cancellationReason: {
          type: 'string',
        },
        activeConflictOverrideCount: {
          type: 'integer',
          minimum: 0,
        },
        version: {
          type: 'integer',
          minimum: 1,
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'title',
        'courseId',
        'groupId',
        'bayId',
        'mentorId',
        'startsAt',
        'endsAt',
        'status',
        'version',
      ],
    },
  },
  updateTrainingSession: {
    path: '/training-sessions/{sessionId}',
    method: 'PATCH',
    permissions: ['training.manage'],
    pathParams: ['sessionId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['version'],
      properties: {
        version: {
          type: 'integer',
          minimum: 1,
        },
        title: {
          type: 'string',
          minLength: 1,
          maxLength: 160,
        },
        groupId: {
          type: 'string',
          format: 'uuid',
        },
        bayId: {
          type: 'string',
          format: 'uuid',
        },
        mentorId: {
          type: 'string',
          format: 'uuid',
        },
        startsAt: {
          type: 'string',
          format: 'date-time',
        },
        endsAt: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        title: {
          type: 'string',
          maxLength: 160,
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        groupId: {
          type: 'string',
          format: 'uuid',
        },
        bayId: {
          type: 'string',
          format: 'uuid',
        },
        mentorId: {
          type: 'string',
          format: 'uuid',
        },
        startsAt: {
          type: 'string',
          format: 'date-time',
        },
        endsAt: {
          type: 'string',
          format: 'date-time',
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'],
        },
        cancellationReason: {
          type: 'string',
        },
        activeConflictOverrideCount: {
          type: 'integer',
          minimum: 0,
        },
        version: {
          type: 'integer',
          minimum: 1,
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'title',
        'courseId',
        'groupId',
        'bayId',
        'mentorId',
        'startsAt',
        'endsAt',
        'status',
        'version',
      ],
    },
  },
  checkTrainingSessionConflicts: {
    path: '/training-sessions/{sessionId}/conflict-check',
    method: 'POST',
    permissions: ['training.manage', 'training.override-conflict'],
    pathParams: ['sessionId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    response: {
      type: 'object',
      required: ['evaluatedAt', 'hasConflicts', 'canPublish', 'conflicts'],
      properties: {
        sessionId: {
          type: 'string',
          format: 'uuid',
        },
        evaluatedAt: {
          type: 'string',
          format: 'date-time',
        },
        hasConflicts: {
          type: 'boolean',
        },
        canPublish: {
          type: 'boolean',
        },
        conflicts: {
          type: 'array',
          items: {
            type: 'object',
            required: ['conflictKey', 'kind', 'overridable', 'overridden', 'message'],
            properties: {
              conflictKey: {
                type: 'string',
                maxLength: 200,
              },
              kind: {
                type: 'string',
                enum: [
                  'BAY_JOB_CONFLICT',
                  'BAY_SESSION_CONFLICT',
                  'BAY_UNAVAILABLE',
                  'BAY_CAPACITY_EXCEEDED',
                  'MENTOR_SESSION_CONFLICT',
                  'MENTOR_WORKSHOP_CONFLICT',
                ],
              },
              overridable: {
                type: 'boolean',
              },
              overridden: {
                type: 'boolean',
              },
              message: {
                type: 'string',
              },
              bayId: {
                type: 'string',
                format: 'uuid',
              },
              mentorId: {
                type: 'string',
                format: 'uuid',
              },
              conflictingReference: {
                type: 'object',
                required: ['kind', 'referenceId', 'referenceLabel', 'startsAt', 'endsAt'],
                properties: {
                  kind: {
                    type: 'string',
                    enum: ['JOB', 'TRAINING_SESSION'],
                  },
                  referenceId: {
                    type: 'string',
                    format: 'uuid',
                  },
                  referenceLabel: {
                    type: 'string',
                  },
                  startsAt: {
                    type: 'string',
                    format: 'date-time',
                  },
                  endsAt: {
                    type: 'string',
                    format: 'date-time',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  createConflictOverrides: {
    path: '/training-sessions/{sessionId}/conflict-overrides',
    method: 'POST',
    permissions: ['training.override-conflict'],
    pathParams: ['sessionId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['conflictKeys', 'reason'],
      properties: {
        conflictKeys: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          uniqueItems: true,
          items: {
            type: 'string',
            maxLength: 200,
          },
        },
        reason: {
          type: 'string',
          minLength: 10,
          maxLength: 500,
        },
      },
    },
    response: {
      type: 'object',
      required: ['evaluatedAt', 'hasConflicts', 'canPublish', 'conflicts'],
      properties: {
        sessionId: {
          type: 'string',
          format: 'uuid',
        },
        evaluatedAt: {
          type: 'string',
          format: 'date-time',
        },
        hasConflicts: {
          type: 'boolean',
        },
        canPublish: {
          type: 'boolean',
        },
        conflicts: {
          type: 'array',
          items: {
            type: 'object',
            required: ['conflictKey', 'kind', 'overridable', 'overridden', 'message'],
            properties: {
              conflictKey: {
                type: 'string',
                maxLength: 200,
              },
              kind: {
                type: 'string',
                enum: [
                  'BAY_JOB_CONFLICT',
                  'BAY_SESSION_CONFLICT',
                  'BAY_UNAVAILABLE',
                  'BAY_CAPACITY_EXCEEDED',
                  'MENTOR_SESSION_CONFLICT',
                  'MENTOR_WORKSHOP_CONFLICT',
                ],
              },
              overridable: {
                type: 'boolean',
              },
              overridden: {
                type: 'boolean',
              },
              message: {
                type: 'string',
              },
              bayId: {
                type: 'string',
                format: 'uuid',
              },
              mentorId: {
                type: 'string',
                format: 'uuid',
              },
              conflictingReference: {
                type: 'object',
                required: ['kind', 'referenceId', 'referenceLabel', 'startsAt', 'endsAt'],
                properties: {
                  kind: {
                    type: 'string',
                    enum: ['JOB', 'TRAINING_SESSION'],
                  },
                  referenceId: {
                    type: 'string',
                    format: 'uuid',
                  },
                  referenceLabel: {
                    type: 'string',
                  },
                  startsAt: {
                    type: 'string',
                    format: 'date-time',
                  },
                  endsAt: {
                    type: 'string',
                    format: 'date-time',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  transitionTrainingSession: {
    path: '/training-sessions/{sessionId}/transitions',
    method: 'POST',
    permissions: ['training.publish', 'training.manage'],
    pathParams: ['sessionId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['toStatus'],
      properties: {
        toStatus: {
          type: 'string',
          enum: ['PUBLISHED', 'COMPLETED', 'CANCELLED'],
        },
        reason: {
          type: 'string',
          minLength: 3,
          maxLength: 500,
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        title: {
          type: 'string',
          maxLength: 160,
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        groupId: {
          type: 'string',
          format: 'uuid',
        },
        bayId: {
          type: 'string',
          format: 'uuid',
        },
        mentorId: {
          type: 'string',
          format: 'uuid',
        },
        startsAt: {
          type: 'string',
          format: 'date-time',
        },
        endsAt: {
          type: 'string',
          format: 'date-time',
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'],
        },
        cancellationReason: {
          type: 'string',
        },
        activeConflictOverrideCount: {
          type: 'integer',
          minimum: 0,
        },
        version: {
          type: 'integer',
          minimum: 1,
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'title',
        'courseId',
        'groupId',
        'bayId',
        'mentorId',
        'startsAt',
        'endsAt',
        'status',
        'version',
      ],
    },
  },
  recordSessionAttendance: {
    path: '/training-sessions/{sessionId}/attendance',
    method: 'PUT',
    permissions: ['training.attendance.record'],
    pathParams: ['sessionId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['records'],
      properties: {
        records: {
          type: 'array',
          minItems: 1,
          maxItems: 200,
          items: {
            type: 'object',
            required: ['studentId', 'status'],
            properties: {
              studentId: {
                type: 'string',
                format: 'uuid',
              },
              status: {
                type: 'string',
                enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'],
              },
              note: {
                type: 'string',
                maxLength: 300,
              },
            },
          },
        },
      },
    },
    response: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              sessionId: {
                type: 'string',
                format: 'uuid',
              },
              studentId: {
                type: 'string',
                format: 'uuid',
              },
              status: {
                type: 'string',
                enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'],
              },
              note: {
                type: 'string',
                maxLength: 300,
              },
            },
            required: ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'sessionId', 'studentId', 'status'],
          },
        },
      },
    },
  },
  listAttendanceRecords: {
    path: '/attendance-records',
    method: 'GET',
    permissions: ['training.read', 'students.self'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        from: {
          type: 'string',
          format: 'date-time',
        },
        to: {
          type: 'string',
          format: 'date-time',
        },
        sessionId: {
          type: 'string',
          format: 'uuid',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'],
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              sessionId: {
                type: 'string',
                format: 'uuid',
              },
              studentId: {
                type: 'string',
                format: 'uuid',
              },
              status: {
                type: 'string',
                enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'],
              },
              note: {
                type: 'string',
                maxLength: 300,
              },
            },
            required: ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'sessionId', 'studentId', 'status'],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  listPracticalTasks: {
    path: '/practical-tasks',
    method: 'GET',
    permissions: ['training.read'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        q: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
        competencyId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'ARCHIVED'],
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              code: {
                type: 'string',
                minLength: 1,
                maxLength: 30,
              },
              title: {
                type: 'object',
                required: ['en'],
                properties: {
                  en: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 200,
                  },
                  ar: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 200,
                  },
                },
              },
              description: {
                type: 'string',
                maxLength: 2000,
              },
              competencyId: {
                type: 'string',
                format: 'uuid',
              },
              expectedMinutes: {
                type: 'integer',
                minimum: 1,
                maximum: 1440,
              },
              status: {
                type: 'string',
                enum: ['ACTIVE', 'ARCHIVED'],
              },
            },
            required: [
              'id',
              'createdAt',
              'updatedAt',
              'createdBy',
              'updatedBy',
              'code',
              'title',
              'competencyId',
              'expectedMinutes',
              'status',
            ],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  createPracticalTask: {
    path: '/practical-tasks',
    method: 'POST',
    permissions: ['training.manage'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['code', 'title', 'competencyId', 'expectedMinutes'],
      properties: {
        code: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        title: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        description: {
          type: 'string',
          maxLength: 2000,
        },
        competencyId: {
          type: 'string',
          format: 'uuid',
        },
        expectedMinutes: {
          type: 'integer',
          minimum: 1,
          maximum: 1440,
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        code: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        title: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        description: {
          type: 'string',
          maxLength: 2000,
        },
        competencyId: {
          type: 'string',
          format: 'uuid',
        },
        expectedMinutes: {
          type: 'integer',
          minimum: 1,
          maximum: 1440,
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'ARCHIVED'],
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'code',
        'title',
        'competencyId',
        'expectedMinutes',
        'status',
      ],
    },
  },
  updatePracticalTask: {
    path: '/practical-tasks/{taskId}',
    method: 'PATCH',
    permissions: ['training.manage'],
    pathParams: ['taskId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      properties: {
        title: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        description: {
          type: 'string',
          maxLength: 2000,
        },
        competencyId: {
          type: 'string',
          format: 'uuid',
        },
        expectedMinutes: {
          type: 'integer',
          minimum: 1,
          maximum: 1440,
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'ARCHIVED'],
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        code: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        title: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        description: {
          type: 'string',
          maxLength: 2000,
        },
        competencyId: {
          type: 'string',
          format: 'uuid',
        },
        expectedMinutes: {
          type: 'integer',
          minimum: 1,
          maximum: 1440,
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'ARCHIVED'],
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'code',
        'title',
        'competencyId',
        'expectedMinutes',
        'status',
      ],
    },
  },
  listAssessments: {
    path: '/assessments',
    method: 'GET',
    permissions: ['training.read', 'students.self'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        from: {
          type: 'string',
          format: 'date-time',
        },
        to: {
          type: 'string',
          format: 'date-time',
        },
        sessionId: {
          type: 'string',
          format: 'uuid',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        taskId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        result: {
          type: 'string',
          enum: ['PASS', 'FAIL', 'NEEDS_IMPROVEMENT'],
        },
        signOffStatus: {
          type: 'string',
          enum: ['PENDING', 'SIGNED_OFF', 'RETURNED'],
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              sessionId: {
                type: 'string',
                format: 'uuid',
              },
              studentId: {
                type: 'string',
                format: 'uuid',
              },
              taskId: {
                type: 'string',
                format: 'uuid',
              },
              courseId: {
                type: 'string',
                format: 'uuid',
              },
              result: {
                type: 'string',
                enum: ['PASS', 'FAIL', 'NEEDS_IMPROVEMENT'],
              },
              timeOnTaskMinutes: {
                type: 'integer',
                minimum: 0,
                maximum: 1440,
              },
              mentorNote: {
                type: 'string',
                maxLength: 2000,
              },
              evidenceAttachmentIds: {
                type: 'array',
                items: {
                  type: 'string',
                  format: 'uuid',
                },
              },
              assessedBy: {
                type: 'string',
                format: 'uuid',
              },
              assessedAt: {
                type: 'string',
                format: 'date-time',
              },
              signOffStatus: {
                type: 'string',
                enum: ['PENDING', 'SIGNED_OFF', 'RETURNED'],
              },
              signedOffBy: {
                type: 'string',
                format: 'uuid',
              },
              signedOffAt: {
                type: 'string',
                format: 'date-time',
              },
              signOffNote: {
                type: 'string',
              },
              countsTowardCompletion: {
                type: 'boolean',
              },
              version: {
                type: 'integer',
                minimum: 1,
              },
            },
            required: [
              'id',
              'createdAt',
              'updatedAt',
              'createdBy',
              'updatedBy',
              'sessionId',
              'studentId',
              'taskId',
              'courseId',
              'result',
              'timeOnTaskMinutes',
              'evidenceAttachmentIds',
              'assessedBy',
              'assessedAt',
              'signOffStatus',
              'countsTowardCompletion',
              'version',
            ],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  createAssessment: {
    path: '/assessments',
    method: 'POST',
    permissions: ['training.assess'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['sessionId', 'studentId', 'taskId', 'result', 'timeOnTaskMinutes'],
      properties: {
        sessionId: {
          type: 'string',
          format: 'uuid',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        taskId: {
          type: 'string',
          format: 'uuid',
        },
        result: {
          type: 'string',
          enum: ['PASS', 'FAIL', 'NEEDS_IMPROVEMENT'],
        },
        timeOnTaskMinutes: {
          type: 'integer',
          minimum: 0,
          maximum: 1440,
        },
        mentorNote: {
          type: 'string',
          maxLength: 2000,
        },
        evidenceAttachmentIds: {
          type: 'array',
          maxItems: 10,
          uniqueItems: true,
          items: {
            type: 'string',
            format: 'uuid',
          },
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        sessionId: {
          type: 'string',
          format: 'uuid',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        taskId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        result: {
          type: 'string',
          enum: ['PASS', 'FAIL', 'NEEDS_IMPROVEMENT'],
        },
        timeOnTaskMinutes: {
          type: 'integer',
          minimum: 0,
          maximum: 1440,
        },
        mentorNote: {
          type: 'string',
          maxLength: 2000,
        },
        evidenceAttachmentIds: {
          type: 'array',
          items: {
            type: 'string',
            format: 'uuid',
          },
        },
        assessedBy: {
          type: 'string',
          format: 'uuid',
        },
        assessedAt: {
          type: 'string',
          format: 'date-time',
        },
        signOffStatus: {
          type: 'string',
          enum: ['PENDING', 'SIGNED_OFF', 'RETURNED'],
        },
        signedOffBy: {
          type: 'string',
          format: 'uuid',
        },
        signedOffAt: {
          type: 'string',
          format: 'date-time',
        },
        signOffNote: {
          type: 'string',
        },
        countsTowardCompletion: {
          type: 'boolean',
        },
        version: {
          type: 'integer',
          minimum: 1,
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'sessionId',
        'studentId',
        'taskId',
        'courseId',
        'result',
        'timeOnTaskMinutes',
        'evidenceAttachmentIds',
        'assessedBy',
        'assessedAt',
        'signOffStatus',
        'countsTowardCompletion',
        'version',
      ],
    },
  },
  updateAssessment: {
    path: '/assessments/{assessmentId}',
    method: 'PATCH',
    permissions: ['training.assess'],
    pathParams: ['assessmentId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['version', 'changeReason'],
      properties: {
        version: {
          type: 'integer',
          minimum: 1,
        },
        result: {
          type: 'string',
          enum: ['PASS', 'FAIL', 'NEEDS_IMPROVEMENT'],
        },
        timeOnTaskMinutes: {
          type: 'integer',
          minimum: 0,
          maximum: 1440,
        },
        mentorNote: {
          type: 'string',
          maxLength: 2000,
        },
        evidenceAttachmentIds: {
          type: 'array',
          maxItems: 10,
          uniqueItems: true,
          items: {
            type: 'string',
            format: 'uuid',
          },
        },
        changeReason: {
          type: 'string',
          minLength: 3,
          maxLength: 500,
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        sessionId: {
          type: 'string',
          format: 'uuid',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        taskId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        result: {
          type: 'string',
          enum: ['PASS', 'FAIL', 'NEEDS_IMPROVEMENT'],
        },
        timeOnTaskMinutes: {
          type: 'integer',
          minimum: 0,
          maximum: 1440,
        },
        mentorNote: {
          type: 'string',
          maxLength: 2000,
        },
        evidenceAttachmentIds: {
          type: 'array',
          items: {
            type: 'string',
            format: 'uuid',
          },
        },
        assessedBy: {
          type: 'string',
          format: 'uuid',
        },
        assessedAt: {
          type: 'string',
          format: 'date-time',
        },
        signOffStatus: {
          type: 'string',
          enum: ['PENDING', 'SIGNED_OFF', 'RETURNED'],
        },
        signedOffBy: {
          type: 'string',
          format: 'uuid',
        },
        signedOffAt: {
          type: 'string',
          format: 'date-time',
        },
        signOffNote: {
          type: 'string',
        },
        countsTowardCompletion: {
          type: 'boolean',
        },
        version: {
          type: 'integer',
          minimum: 1,
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'sessionId',
        'studentId',
        'taskId',
        'courseId',
        'result',
        'timeOnTaskMinutes',
        'evidenceAttachmentIds',
        'assessedBy',
        'assessedAt',
        'signOffStatus',
        'countsTowardCompletion',
        'version',
      ],
    },
  },
  signOffAssessment: {
    path: '/assessments/{assessmentId}/sign-off',
    method: 'POST',
    permissions: ['training.signoff'],
    pathParams: ['assessmentId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['decision'],
      properties: {
        decision: {
          type: 'string',
          enum: ['SIGNED_OFF', 'RETURNED'],
        },
        note: {
          type: 'string',
          minLength: 3,
          maxLength: 1000,
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        sessionId: {
          type: 'string',
          format: 'uuid',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        taskId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        result: {
          type: 'string',
          enum: ['PASS', 'FAIL', 'NEEDS_IMPROVEMENT'],
        },
        timeOnTaskMinutes: {
          type: 'integer',
          minimum: 0,
          maximum: 1440,
        },
        mentorNote: {
          type: 'string',
          maxLength: 2000,
        },
        evidenceAttachmentIds: {
          type: 'array',
          items: {
            type: 'string',
            format: 'uuid',
          },
        },
        assessedBy: {
          type: 'string',
          format: 'uuid',
        },
        assessedAt: {
          type: 'string',
          format: 'date-time',
        },
        signOffStatus: {
          type: 'string',
          enum: ['PENDING', 'SIGNED_OFF', 'RETURNED'],
        },
        signedOffBy: {
          type: 'string',
          format: 'uuid',
        },
        signedOffAt: {
          type: 'string',
          format: 'date-time',
        },
        signOffNote: {
          type: 'string',
        },
        countsTowardCompletion: {
          type: 'boolean',
        },
        version: {
          type: 'integer',
          minimum: 1,
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'sessionId',
        'studentId',
        'taskId',
        'courseId',
        'result',
        'timeOnTaskMinutes',
        'evidenceAttachmentIds',
        'assessedBy',
        'assessedAt',
        'signOffStatus',
        'countsTowardCompletion',
        'version',
      ],
    },
  },
  listCompetencies: {
    path: '/competencies',
    method: 'GET',
    permissions: ['training.read'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'ARCHIVED'],
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              code: {
                type: 'string',
                minLength: 1,
                maxLength: 30,
              },
              name: {
                type: 'object',
                required: ['en'],
                properties: {
                  en: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 200,
                  },
                  ar: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 200,
                  },
                },
              },
              description: {
                type: 'string',
                maxLength: 1000,
              },
              status: {
                type: 'string',
                enum: ['ACTIVE', 'ARCHIVED'],
              },
            },
            required: ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'code', 'name', 'status'],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  createCompetency: {
    path: '/competencies',
    method: 'POST',
    permissions: ['training.manage'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['code', 'name'],
      properties: {
        code: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        name: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        description: {
          type: 'string',
          maxLength: 1000,
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        code: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        name: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        description: {
          type: 'string',
          maxLength: 1000,
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'ARCHIVED'],
        },
      },
      required: ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'code', 'name', 'status'],
    },
  },
  updateCompetency: {
    path: '/competencies/{competencyId}',
    method: 'PATCH',
    permissions: ['training.manage'],
    pathParams: ['competencyId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      properties: {
        name: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        description: {
          type: 'string',
          maxLength: 1000,
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'ARCHIVED'],
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        code: {
          type: 'string',
          minLength: 1,
          maxLength: 30,
        },
        name: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        description: {
          type: 'string',
          maxLength: 1000,
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'ARCHIVED'],
        },
      },
      required: ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'code', 'name', 'status'],
    },
  },
  listCertificates: {
    path: '/certificates',
    method: 'GET',
    permissions: ['training.read', 'students.self'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          minimum: 1,
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        sort: {
          type: 'string',
          maxLength: 100,
          pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['ISSUED', 'REVOKED'],
        },
      },
      required: [],
    },
    response: {
      type: 'object',
      required: ['items', 'page'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              createdAt: {
                type: 'string',
                format: 'date-time',
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
              createdBy: {
                type: 'string',
                format: 'uuid',
              },
              updatedBy: {
                type: 'string',
                format: 'uuid',
              },
              certificateNumber: {
                type: 'string',
                pattern: '^CERT-[0-9]{4}-[0-9]{6}$',
              },
              studentId: {
                type: 'string',
                format: 'uuid',
              },
              courseId: {
                type: 'string',
                format: 'uuid',
              },
              issuedAt: {
                type: 'string',
                format: 'date-time',
              },
              issuedBy: {
                type: 'string',
                format: 'uuid',
              },
              status: {
                type: 'string',
                enum: ['ISSUED', 'REVOKED'],
              },
              revokedAt: {
                type: 'string',
                format: 'date-time',
              },
              revokedBy: {
                type: 'string',
                format: 'uuid',
              },
              revocationReason: {
                type: 'string',
              },
              verificationToken: {
                type: 'string',
                minLength: 43,
                maxLength: 86,
                pattern: '^[A-Za-z0-9_-]+$',
              },
            },
            required: [
              'id',
              'createdAt',
              'updatedAt',
              'createdBy',
              'updatedBy',
              'certificateNumber',
              'studentId',
              'courseId',
              'issuedAt',
              'issuedBy',
              'status',
              'verificationToken',
            ],
          },
        },
        page: {
          type: 'object',
          required: ['page', 'pageSize', 'totalItems', 'totalPages'],
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
            },
            totalItems: {
              type: 'integer',
              minimum: 0,
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
            },
          },
        },
      },
    },
  },
  issueCertificate: {
    path: '/certificates',
    method: 'POST',
    permissions: ['certificates.issue'],
    pathParams: [],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['studentId', 'courseId'],
      properties: {
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        certificateNumber: {
          type: 'string',
          pattern: '^CERT-[0-9]{4}-[0-9]{6}$',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        issuedAt: {
          type: 'string',
          format: 'date-time',
        },
        issuedBy: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['ISSUED', 'REVOKED'],
        },
        revokedAt: {
          type: 'string',
          format: 'date-time',
        },
        revokedBy: {
          type: 'string',
          format: 'uuid',
        },
        revocationReason: {
          type: 'string',
        },
        verificationToken: {
          type: 'string',
          minLength: 43,
          maxLength: 86,
          pattern: '^[A-Za-z0-9_-]+$',
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'certificateNumber',
        'studentId',
        'courseId',
        'issuedAt',
        'issuedBy',
        'status',
        'verificationToken',
      ],
    },
  },
  getCertificate: {
    path: '/certificates/{certificateId}',
    method: 'GET',
    permissions: ['training.read', 'students.self'],
    pathParams: ['certificateId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        certificateNumber: {
          type: 'string',
          pattern: '^CERT-[0-9]{4}-[0-9]{6}$',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        issuedAt: {
          type: 'string',
          format: 'date-time',
        },
        issuedBy: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['ISSUED', 'REVOKED'],
        },
        revokedAt: {
          type: 'string',
          format: 'date-time',
        },
        revokedBy: {
          type: 'string',
          format: 'uuid',
        },
        revocationReason: {
          type: 'string',
        },
        verificationToken: {
          type: 'string',
          minLength: 43,
          maxLength: 86,
          pattern: '^[A-Za-z0-9_-]+$',
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'certificateNumber',
        'studentId',
        'courseId',
        'issuedAt',
        'issuedBy',
        'status',
        'verificationToken',
      ],
    },
  },
  revokeCertificate: {
    path: '/certificates/{certificateId}/revocations',
    method: 'POST',
    permissions: ['certificates.revoke'],
    pathParams: ['certificateId'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    body: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          minLength: 3,
          maxLength: 500,
        },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        createdBy: {
          type: 'string',
          format: 'uuid',
        },
        updatedBy: {
          type: 'string',
          format: 'uuid',
        },
        certificateNumber: {
          type: 'string',
          pattern: '^CERT-[0-9]{4}-[0-9]{6}$',
        },
        studentId: {
          type: 'string',
          format: 'uuid',
        },
        courseId: {
          type: 'string',
          format: 'uuid',
        },
        issuedAt: {
          type: 'string',
          format: 'date-time',
        },
        issuedBy: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: ['ISSUED', 'REVOKED'],
        },
        revokedAt: {
          type: 'string',
          format: 'date-time',
        },
        revokedBy: {
          type: 'string',
          format: 'uuid',
        },
        revocationReason: {
          type: 'string',
        },
        verificationToken: {
          type: 'string',
          minLength: 43,
          maxLength: 86,
          pattern: '^[A-Za-z0-9_-]+$',
        },
      },
      required: [
        'id',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'certificateNumber',
        'studentId',
        'courseId',
        'issuedAt',
        'issuedBy',
        'status',
        'verificationToken',
      ],
    },
  },
  verifyCertificate: {
    path: '/public/certificate-verifications/{verificationToken}',
    method: 'GET',
    permissions: [],
    pathParams: ['verificationToken'],
    query: {
      type: 'object',
      properties: {},
      required: [],
    },
    response: {
      type: 'object',
      required: ['certificateNumber', 'status', 'holderDisplayName', 'courseName', 'issuedAt'],
      properties: {
        certificateNumber: {
          type: 'string',
        },
        status: {
          type: 'string',
          enum: ['ISSUED', 'REVOKED'],
        },
        holderDisplayName: {
          type: 'string',
        },
        courseName: {
          type: 'object',
          required: ['en'],
          properties: {
            en: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            ar: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
          },
        },
        issuedAt: {
          type: 'string',
          format: 'date-time',
        },
        revokedAt: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
  },
} as const
