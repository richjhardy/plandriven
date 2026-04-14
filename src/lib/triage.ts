import type { Config } from './config.js';
import type { ModelStats } from './tracker.js';
import { claudePrint } from './claude.js';

export interface TriageResult {
  complexity: 'simple' | 'moderate' | 'complex';
  planAuthorModel: string;
  executorModel: string;
  estimatedFiles: number;
  estimatedSteps: number;
  reasoning: string;
}

const TRIAGE_PROMPT = `You are a task complexity classifier for a software project.
Analyze the task description and respond with ONLY a JSON object (no markdown, no explanation):

{
  "complexity": "simple" | "moderate" | "complex",
  "estimated_files": <number>,
  "estimated_steps": <number>,
  "reasoning": "<one sentence explaining why>"
}

Classification guide:
- simple: 1-3 files, cosmetic/text/config changes, single concern
- moderate: 4-10 files, new feature or integration, multiple concerns
- complex: 10+ files, architectural change, cross-cutting concerns, migrations

Task: `;

/**
 * Classify task complexity. Uses Haiku for fast classification,
 * falls back to local heuristic if the call fails.
 */
export async function triageTask(
  description: string,
  config: Config,
  modelStats?: ModelStats[],
): Promise<TriageResult> {
  // Try Haiku-powered triage first
  let classification = await triageWithModel(description);

  // Fall back to local heuristic if LLM call fails
  if (!classification) {
    classification = classifyLocally(description);
  }

  const { complexity, estimatedFiles, estimatedSteps, reasoning } = classification;

  // Determine models from config routing table
  let planAuthorModel = config.model_routing[complexity];
  let executorModel = config.model_routing[complexity];

  // Stronger models author plans for harder tasks
  if (complexity === 'complex') {
    planAuthorModel = 'opus';
  } else if (complexity === 'moderate') {
    planAuthorModel = 'sonnet';
  }

  // Adjust based on historical performance
  if (modelStats && modelStats.length > 0) {
    const adjusted = adjustFromHistory(executorModel, modelStats);
    if (adjusted) {
      executorModel = adjusted;
    }
  }

  return { complexity, planAuthorModel, executorModel, estimatedFiles, estimatedSteps, reasoning };
}

/**
 * Call Haiku to classify task complexity. Returns null on failure.
 */
async function triageWithModel(description: string): Promise<{
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedFiles: number;
  estimatedSteps: number;
  reasoning: string;
} | null> {
  try {
    const output = claudePrint(TRIAGE_PROMPT + description, {
      model: 'haiku',
      cwd: process.cwd(),
    });

    // Extract JSON from response — handle potential markdown wrapping
    const jsonStr = output.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    const complexity = parsed.complexity;
    if (!['simple', 'moderate', 'complex'].includes(complexity)) {
      return null;
    }

    return {
      complexity,
      estimatedFiles: Number(parsed.estimated_files) || 5,
      estimatedSteps: Number(parsed.estimated_steps) || 3,
      reasoning: String(parsed.reasoning || 'Classified by Haiku'),
    };
  } catch {
    // LLM call failed — fall back to local heuristic
    return null;
  }
}

/**
 * Local keyword-based fallback. Used when Haiku is unavailable
 * (no CLI installed, rate limited, offline).
 */
function classifyLocally(description: string): {
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedFiles: number;
  estimatedSteps: number;
  reasoning: string;
} {
  const lower = description.toLowerCase();

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

  const simpleHits = simpleSignals.filter(s => lower.includes(s));
  const moderateHits = moderateSignals.filter(s => lower.includes(s));
  const complexHits = complexSignals.filter(s => lower.includes(s));

  const wordCount = lower.split(/\s+/).length;

  if (complexHits.length > 0 || wordCount > 50) {
    return {
      complexity: 'complex', estimatedFiles: 15, estimatedSteps: 8,
      reasoning: `[offline fallback] ${complexHits.length > 0 ? `Signals: ${complexHits.join(', ')}` : `Long description (${wordCount} words)`}`,
    };
  }

  if (moderateHits.length > 0 || wordCount > 20) {
    return {
      complexity: 'moderate', estimatedFiles: 6, estimatedSteps: 4,
      reasoning: `[offline fallback] ${moderateHits.length > 0 ? `Signals: ${moderateHits.join(', ')}` : `Medium description (${wordCount} words)`}`,
    };
  }

  return {
    complexity: 'simple', estimatedFiles: 2, estimatedSteps: 2,
    reasoning: `[offline fallback] ${simpleHits.length > 0 ? `Signals: ${simpleHits.join(', ')}` : 'Short description'}`,
  };
}

/**
 * If a model has a poor success rate in recent history, suggest upgrading.
 */
function adjustFromHistory(model: string, stats: ModelStats[]): string | null {
  const modelStat = stats.find(s => s.model === model);
  if (!modelStat || modelStat.total_runs < 3) return null;

  if (modelStat.success_rate < 0.7) {
    const modelTier = ['haiku', 'sonnet', 'opus'];
    const currentIdx = modelTier.indexOf(model);
    if (currentIdx >= 0 && currentIdx < modelTier.length - 1) {
      return modelTier[currentIdx + 1];
    }
  }

  return null;
}
