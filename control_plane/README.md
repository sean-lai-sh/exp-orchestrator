# Control Plane API

A modular Express.js API server with TypeScript for managing workflows.

## Structure

```
src/
├── index.ts              # Main application entry point
├── routes/               # Route definitions
│   └── workflow.ts       # Workflow routes
├── controllers/          # Business logic
│   └── workflowController.ts
├── middleware/           # Custom middleware
│   └── logging.ts        # Request logging and error handling
└── types/               # TypeScript type definitions
    └── workflow.ts      # Workflow-related types
```

## Features

- **CORS enabled** for cross-origin requests
- **JSON parsing** with 10MB limit
- **Request logging** middleware
- **Error handling** middleware
- **TypeScript** for type safety
- **Modular structure** for easy scaling

## API Endpoints

### Health Check
- `GET /health` - Returns server status

### Workflow Management
- `POST /api/workflow` - Create a new workflow
- `GET /api/workflow/:id` - Get a specific workflow
- `PUT /api/workflow/:id` - Update a workflow
- `DELETE /api/workflow/:id` - Delete a workflow

## Workflow JSON Structure

```json
{
  "name": "Example Workflow",
  "description": "A sample workflow",
  "steps": [
    {
      "id": "step1",
      "name": "First Step",
      "type": "action",
      "config": {
        "param1": "value1"
      },
      "dependencies": []
    }
  ],
  "metadata": {
    "author": "system",
    "version": "1.0"
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
