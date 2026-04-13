import type { Config } from './config.js';
import type { ModelStats } from './tracker.js';

export interface TriageResult {
  complexity: 'simple' | 'moderate' | 'complex';
  planAuthorModel: string;
  executorModel: string;
  estimatedFiles: number;
  estimatedSteps: number;
  reasoning: string;
}

/**
 * Classify task complexity from a description and optional codebase context.
 * This is the local heuristic — no LLM call required for basic routing.
 */
export function triageTask(
  description: string,
  config: Config,
  modelStats?: ModelStats[],
): TriageResult {
  const lower = description.toLowerCase();

  // Estimate complexity from keywords and description length
  const { complexity, estimatedFiles, estimatedSteps, reasoning } = classifyComplexity(lower, config);

  // Determine models from config routing table
  let planAuthorModel = config.model_routing[complexity];
  let executorModel = config.model_routing[complexity];

  // For complex tasks, use a stronger model to author the plan
  if (complexity === 'complex') {
    planAuthorModel = 'opus';
  } else if (complexity === 'moderate') {
    planAuthorModel = 'sonnet';
  }

  // Adjust based on historical performance if available
  if (modelStats && modelStats.length > 0) {
    const adjusted = adjustFromHistory(executorModel, modelStats);
    if (adjusted) {
      executorModel = adjusted;
    }
  }

  return { complexity, planAuthorModel, executorModel, estimatedFiles, estimatedSteps, reasoning };
}

function classifyComplexity(
  description: string,
  config: Config,
): { complexity: 'simple' | 'moderate' | 'complex'; estimatedFiles: number; estimatedSteps: number; reasoning: string } {
  // Complexity signals
  const simpleSignals = [
    'fix typo', 'rename', 'update text', 'change string', 'lint',
    'format', 'bump version', 'add comment', 'remove unused',
    'i18n', 'translation',
  ];
  const complexSignals = [
    'refactor', 'architecture', 'migration', 'auth', 'authentication',
    'database', 'api redesign', 'rewrite', 'new service', 'microservice',
    'security', 'performance overhaul', 'real-time', 'websocket',
  ];
  const moderateSignals = [
    'add feature', 'new screen', 'new page', 'new endpoint', 'crud',
    'form', 'validation', 'integration', 'test coverage', 'dark mode',
    'notifications', 'search', 'filter', 'pagination',
  ];

  const simpleScore = simpleSignals.filter(s => description.includes(s)).length;
  const moderateScore = moderateSignals.filter(s => description.includes(s)).length;
  const complexScore = complexSignals.filter(s => description.includes(s)).length;

  // Also consider description length as a proxy
  const wordCount = description.split(/\s+/).length;

  if (complexScore > 0 || wordCount > 50) {
    return {
      complexity: 'complex',
      estimatedFiles: 15,
      estimatedSteps: 8,
      reasoning: complexScore > 0
        ? `Detected complex signals: ${complexSignals.filter(s => description.includes(s)).join(', ')}`
        : `Long description (${wordCount} words) suggests complex task`,
    };
  }

  if (moderateScore > 0 || wordCount > 20) {
    return {
      complexity: 'moderate',
      estimatedFiles: 6,
      estimatedSteps: 4,
      reasoning: moderateScore > 0
        ? `Detected moderate signals: ${moderateSignals.filter(s => description.includes(s)).join(', ')}`
        : `Medium description (${wordCount} words) suggests moderate task`,
    };
  }

  return {
    complexity: 'simple',
    estimatedFiles: 2,
    estimatedSteps: 2,
    reasoning: simpleScore > 0
      ? `Detected simple signals: ${simpleSignals.filter(s => description.includes(s)).join(', ')}`
      : 'Short description suggests simple task',
  };
}

/**
 * If a model has a poor success rate in recent history, suggest upgrading.
 */
function adjustFromHistory(model: string, stats: ModelStats[]): string | null {
  const modelStat = stats.find(s => s.model === model);
  if (!modelStat || modelStat.total_runs < 3) return null;

  // If success rate is below 70%, suggest upgrade
  if (modelStat.success_rate < 0.7) {
    const modelTier = ['haiku', 'sonnet', 'opus'];
    const currentIdx = modelTier.indexOf(model);
    if (currentIdx >= 0 && currentIdx < modelTier.length - 1) {
      return modelTier[currentIdx + 1];
    }
  }

  return null;
}
