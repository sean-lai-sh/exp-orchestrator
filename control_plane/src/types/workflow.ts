export interface WorkflowRequest {
  name: string;
  description?: string;
  steps: WorkflowStep[];
  metadata?: Record<string, any>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  dependencies?: string[];
}

export interface WorkflowResponse {
  success: boolean;
  message: string;
  data?: {
    id: string;
    name: string;
    description?: string;
    steps?: WorkflowStep[];
    metadata?: Record<string, any>;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  error?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  metadata?: Record<string, any>;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}
