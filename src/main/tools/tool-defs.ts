import type { ToolDefinition } from '../../shared/types';

export const FILE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file inside the project workspace.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a UTF-8 text file inside the project workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files inside the project workspace, excluding dependency and build directories.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete one file inside the project workspace. Directories are rejected.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
    },
  },
];

export const COMMAND_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run one allowlisted executable inside the project workspace. Never pass a shell string.',
      parameters: {
        type: 'object',
        properties: {
          executable: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
        required: ['executable', 'args', 'reason'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Show git status for the project workspace.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show a git diff summary for the project workspace.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

export const STAGE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'update_stage',
    description: 'Move the project to a valid next workflow stage.',
    parameters: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          enum: ['PLANNING', 'READY', 'BUILDING', 'TESTING', 'REPAIRING', 'DOCUMENTING', 'REVIEW_REQUIRED', 'NEEDS_REPAIR', 'BLOCKED', 'FAILED'],
        },
        summary: { type: 'string' },
      },
      required: ['stage', 'summary'],
      additionalProperties: false,
    },
  },
};
