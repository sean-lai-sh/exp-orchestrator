import express from 'express';
import cors from 'cors';
import workflowRoutes from './routes/workflow';
import { requestLogger, errorHandler } from './middleware/logging';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Routes
app.use('/api/workflow', workflowRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware (should be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;