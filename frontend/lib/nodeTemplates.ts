import type { NodeTemplate, SenderNodeData, ReceiverNodeData, PluginNodeData } from './types';

export const nodeTemplates: NodeTemplate[] = [
  // Sender Templates
  {
    id: 'generic-sender',
    name: 'Generic Sender',
    description: 'A basic sender node that can transmit any type of data',
    type: 'sender',
    category: 'senders',
    defaultData: {
      name: 'Generic Sender',
      description: 'A versatile sender node for any data type',
      nodeType: 'sender' as const,
      sources: ['generic_output'],
      access_types: {
        canSend: true,
        canReceive: true, // Can receive configuration/control signals
        allowedSendTypes: ['generic', 'text', 'binary', 'json', 'xml'],
        allowedReceiveTypes: ['generic', 'control', 'config']
      }
    } as Partial<SenderNodeData>
  },
  {
    id: 'file-sender',
    name: 'File Sender',
    description: 'Sends files and documents to connected nodes',
    type: 'sender',
    category: 'senders',
    defaultData: {
      name: 'File Sender',
      description: 'Specialized for sending files and documents',
      nodeType: 'sender' as const,
      sources: ['file_output', 'metadata_output'],
      access_types: {
        canSend: true,
        canReceive: true, // Can receive file paths or control signals
        allowedSendTypes: ['binary', 'file', 'metadata'],
        allowedReceiveTypes: ['text', 'control', 'file_path']
      }
    } as Partial<SenderNodeData>
  },
  {
    id: 'api-sender',
    name: 'API Sender',
    description: 'Sends HTTP requests and API calls',
    type: 'sender',
    category: 'senders',
    defaultData: {
      name: 'API Sender',
      description: 'Makes HTTP requests and sends API data',
      nodeType: 'sender' as const,
      sources: ['api_response', 'status_output', 'headers_output'],
      access_types: {
        canSend: true,
        canReceive: true, // Can receive API endpoints, parameters
        allowedSendTypes: ['json', 'xml', 'text', 'status'],
        allowedReceiveTypes: ['json', 'text', 'url', 'config']
      }
    } as Partial<SenderNodeData>
  },
  
  // Receiver Templates  
  {
    id: 'generic-receiver',
    name: 'Generic Receiver',
    description: 'A basic receiver node that can accept any type of data',
    type: 'receiver',
    category: 'receivers',
    defaultData: {
      name: 'Generic Receiver',
      description: 'A versatile receiver node for any data type',
      nodeType: 'receiver' as const,
      sources: ['processed_output'], // Receivers can also output processed data
      access_types: {
        canSend: true, // Can send acknowledgments or processed data
        canReceive: true,
        allowedSendTypes: ['generic', 'acknowledgment', 'status'],
        allowedReceiveTypes: ['generic', 'text', 'binary', 'json', 'xml']
      }
    } as Partial<ReceiverNodeData>
  },
  {
    id: 'database-receiver',
    name: 'Database Receiver',
    description: 'Stores received data in a database',
    type: 'receiver',
    category: 'receivers',
    defaultData: {
      name: 'Database Receiver',
      description: 'Receives and stores data in database systems',
      nodeType: 'receiver' as const,
      sources: ['db_status', 'record_id', 'query_result'],
      access_types: {
        canSend: true, // Can send database status, record IDs
        canReceive: true,
        allowedSendTypes: ['status', 'id', 'query_result'],
        allowedReceiveTypes: ['json', 'text', 'binary', 'sql']
      }
    } as Partial<ReceiverNodeData>
  },
  {
    id: 'webhook-receiver',
    name: 'Webhook Receiver',
    description: 'Receives data via HTTP webhooks',
    type: 'receiver',
    category: 'receivers',
    defaultData: {
      name: 'Webhook Receiver',
      description: 'Listens for incoming webhook requests',
      nodeType: 'receiver' as const,
      sources: ['webhook_response', 'headers_output'],
      access_types: {
        canSend: true, // Can send webhook responses
        canReceive: true,
        allowedSendTypes: ['json', 'status', 'headers'],
        allowedReceiveTypes: ['json', 'xml', 'text', 'form_data']
      }
    } as Partial<ReceiverNodeData>
  },
  
  // Plugin Templates
  {
    id: 'generic-plugin',
    name: 'Generic Plugin',
    description: 'A basic plugin that can process any type of data',
    type: 'plugin',
    category: 'plugins',
    defaultData: {
      name: 'Generic Plugin',
      description: 'A versatile processing node for any data transformation',
      nodeType: 'plugin' as const,
      sources: ['processed_output', 'metadata_output'],
      access_types: {
        canSend: true,
        canReceive: true,
        allowedSendTypes: ['generic', 'text', 'binary', 'json', 'xml', 'metadata'],
        allowedReceiveTypes: ['generic', 'text', 'binary', 'json', 'xml']
      }
    } as Partial<PluginNodeData>
  },
  {
    id: 'caesar-cipher',
    name: 'Caesar Cipher',
    description: 'Encrypts/decrypts text using Caesar cipher algorithm',
    type: 'plugin',
    category: 'plugins',
    defaultData: {
      name: 'Caesar Cipher',
      description: 'Shifts letters in the alphabet by a fixed number for encryption/decryption',
      nodeType: 'plugin' as const,
      sources: ['encrypted_text', 'cipher_key'],
      access_types: {
        canSend: true,
        canReceive: true,
        allowedSendTypes: ['text', 'cipher_key'],
        allowedReceiveTypes: ['text', 'shift_value']
      }
    } as Partial<PluginNodeData>
  },
  {
    id: 'detect-human',
    name: 'Detect Human',
    description: 'Analyzes data to detect human presence or activity',
    type: 'plugin',
    category: 'plugins',
    defaultData: {
      name: 'Detect Human',
      description: 'AI-powered detection system for identifying human presence in data streams',
      nodeType: 'plugin' as const,
      sources: ['detection_result', 'confidence_score', 'metadata'],
      access_types: {
        canSend: true,
        canReceive: true,
        allowedSendTypes: ['json', 'binary', 'confidence_score'],
        allowedReceiveTypes: ['binary', 'json', 'text', 'image', 'video']
      }
    } as Partial<PluginNodeData>
  },
  {
    id: 'data-validator',
    name: 'Data Validator',
    description: 'Validates incoming data against predefined schemas',
    type: 'plugin',
    category: 'plugins',
    defaultData: {
      name: 'Data Validator',
      description: 'Ensures data integrity by validating against schemas',
      nodeType: 'plugin' as const,
      sources: ['validation_result', 'error_report'],
      access_types: {
        canSend: true,
        canReceive: true,
        allowedSendTypes: ['json', 'xml', 'validation_result'],
        allowedReceiveTypes: ['json', 'xml', 'text', 'schema']
      }
    } as Partial<PluginNodeData>
  },
  {
    id: 'format-converter',
    name: 'Format Converter',
    description: 'Converts data between different formats (JSON, XML, CSV)',
    type: 'plugin',
    category: 'plugins',
    defaultData: {
      name: 'Format Converter',
      description: 'Transforms data between JSON, XML, CSV, and other formats',
      nodeType: 'plugin' as const,
      sources: ['converted_data', 'conversion_log', 'format_metadata'],
      access_types: {
        canSend: true,
        canReceive: true,
        allowedSendTypes: ['json', 'xml', 'text', 'csv'],
        allowedReceiveTypes: ['json', 'xml', 'text', 'binary', 'csv']
      }
    } as Partial<PluginNodeData>
  }
];

// Group templates by category for easy access
export const templatesByCategory = nodeTemplates.reduce((acc, template) => {
  if (!acc[template.category]) {
    acc[template.category] = [];
  }
  acc[template.category].push(template);
  return acc;
}, {} as Record<string, NodeTemplate[]>);

// Group templates by type for separate dropdowns
export const templatesByType = nodeTemplates.reduce((acc, template) => {
  if (!acc[template.type]) {
    acc[template.type] = [];
  }
  acc[template.type].push(template);
  return acc;
}, {} as Record<string, NodeTemplate[]>);
