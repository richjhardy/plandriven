import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

export interface ComplexityThresholds {
  max_files: number;
  max_steps: number;
}

export interface Config {
  defaults: {
    model: string;
    mode: string;
    auto_merge: boolean;
    branch_prefix: string;
    pr_base: string;
  };
  notifications: {
    on_complete: string;
    on_deviation: string;
  };
  complexity_thresholds: {
    simple: ComplexityThresholds;
    moderate: ComplexityThresholds;
  };
  model_routing: {
    simple: string;
    moderate: string;
    complex: string;
  };
  protected_paths: string[];
  guardrails_file: string;
}

const DEFAULT_CONFIG: Config = {
  defaults: {
    model: 'sonnet',
    mode: 'fire-and-review',
    auto_merge: false,
    branch_prefix: 'feature/',
    pr_base: 'main',
  },
  notifications: {
    on_complete: 'terminal-notifier',
    on_deviation: 'terminal-notifier',
  },
  complexity_thresholds: {
    simple: { max_files: 3, max_steps: 10 },
    moderate: { max_files: 10, max_steps: 30 },
  },
  model_routing: {
    simple: 'haiku',
    moderate: 'sonnet',
    complex: 'sonnet',
  },
  protected_paths: ['plans/**', 'CLAUDE.md', '.plandriven.yml'],
  guardrails_file: 'CLAUDE.md',
};

export function loadConfig(dir: string = process.cwd()): Config {
  const configPath = join(dir, '.plandriven.yml');

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(raw) as Partial<Config> | null;

  if (!parsed) {
    return { ...DEFAULT_CONFIG };
  }

  return deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    parsed as unknown as Record<string, unknown>,
  ) as unknown as Config;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];

    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }

  return result;
}
