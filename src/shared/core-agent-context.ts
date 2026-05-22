import { TASKPLANE_AGENT_PRINCIPLES } from './agent-principles.js';
import { TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK } from './task-advancement-framework.js';

export const TASKPLANE_CORE_AGENT_CONTEXT = [
  TASKPLANE_AGENT_PRINCIPLES,
  TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK,
].join('\n\n');
