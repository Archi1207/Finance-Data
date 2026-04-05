const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Finance Data API',
      version: '1.0.0',
      description:
        'A RESTful backend for a finance dashboard system supporting user role management, financial record CRUD, and dashboard analytics.',
      contact: {
        name: 'Archi1207',
        url: 'https://github.com/Archi1207/Finance-Data',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id:         { type: 'integer', example: 1 },
            name:       { type: 'string',  example: 'Alice Admin' },
            email:      { type: 'string',  example: 'admin@example.com' },
            role:       { type: 'string',  enum: ['viewer', 'analyst', 'admin'] },
            status:     { type: 'string',  enum: ['active', 'inactive'] },
            created_at: { type: 'string',  example: '2026-04-05T10:00:00.000Z' },
            updated_at: { type: 'string',  example: '2026-04-05T10:00:00.000Z' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id:           { type: 'integer', example: 1 },
            amount:       { type: 'number',  example: 250.00 },
            type:         { type: 'string',  enum: ['income', 'expense'] },
            category:     { type: 'string',  example: 'Salary' },
            date:         { type: 'string',  example: '2026-04-01' },
            notes:        { type: 'string',  example: 'Monthly salary' },
            creator_id:   { type: 'integer', example: 1 },
            creator_name: { type: 'string',  example: 'Alice Admin' },
            created_at:   { type: 'string',  example: '2026-04-05T10:00:00.000Z' },
            updated_at:   { type: 'string',  example: '2026-04-05T10:00:00.000Z' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            status:  { type: 'string', example: 'error' },
            message: { type: 'string', example: 'Description of the error.' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
