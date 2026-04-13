import { readFileSync } from 'node:fs';
import matter from 'gray-matter';

export interface PlanScope {
  newFiles: string[];
  modifiedFiles: string[];
}

export interface PlanStep {
  title: string;
  body: string;
}

export interface TestScenario {
  id: string;
  description: string;
}

export interface Plan {
  /** Path to the plan file */
  filePath: string;

  /** HTML comment metadata */
  model: string | null;
  mode: string | null;
  dependsOn: string | null;

  /** Parsed sections */
  title: string;
  objective: string;
  constraints: string[];
  scope: PlanScope;
  steps: PlanStep[];
  tests: TestScenario[];

  /** Raw markdown content */
  raw: string;
}

/**
 * Parse a plan markdown file into a structured Plan object.
 *
 * Plan files use HTML comments for metadata (<!-- model: sonnet -->)
 * and standard markdown sections for content.
 */
export function parsePlan(filePath: string): Plan {
  const raw = readFileSync(filePath, 'utf-8');
  return parsePlanContent(raw, filePath);
}

export function parsePlanContent(raw: string, filePath: string = '<inline>'): Plan {
  // Extract HTML comment metadata
  const model = extractComment(raw, 'model');
  const mode = extractComment(raw, 'mode');
  const dependsOn = extractComment(raw, 'depends_on');

  // Strip frontmatter if present (gray-matter handles this)
  const { content } = matter(raw);

  // Parse sections
  const title = extractTitle(content);
  const objective = extractSection(content, 'Objective');
  const constraints = extractListItems(content, 'Constraints');
  const scope = extractScope(content);
  const steps = extractSteps(content);
  const tests = extractTests(content);

  return {
    filePath,
    model,
    mode,
    dependsOn,
    title,
    objective,
    constraints,
    scope,
    steps,
    tests,
    raw,
  };
}

function extractComment(content: string, key: string): string | null {
  const re = new RegExp(`<!--\\s*${key}:\\s*(.+?)\\s*-->`, 'i');
  const match = content.match(re);
  return match ? match[1].trim() : null;
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(?:Plan:\s*)?(.+)$/m);
  return match ? match[1].trim() : '';
}

function extractSection(content: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?!\\n))`, 'm');
  const match = content.match(re);
  return match ? match[1].trim() : '';
}

function extractListItems(content: string, heading: string): string[] {
  const section = extractSection(content, heading);
  if (!section) return [];

  return section
    .split('\n')
    .filter(line => /^\s*[-*]/.test(line))
    .map(line => line.replace(/^\s*[-*]\s*/, '').trim());
}

function extractScope(content: string): PlanScope {
  const section = extractSection(content, 'Scope');
  if (!section) return { newFiles: [], modifiedFiles: [] };

  const newFiles: string[] = [];
  const modifiedFiles: string[] = [];
  let current: string[] | null = null;

  for (const line of section.split('\n')) {
    if (/new\s+files/i.test(line)) {
      current = newFiles;
    } else if (/modified\s+files/i.test(line)) {
      current = modifiedFiles;
    } else if (/^\s*[-*]/.test(line) && current) {
      current.push(line.replace(/^\s*[-*]\s*/, '').trim());
    }
  }

  return { newFiles, modifiedFiles };
}

function extractSteps(content: string): PlanStep[] {
  const section = extractSection(content, 'Implementation Steps');
  if (!section) return [];

  const steps: PlanStep[] = [];
  const stepRegex = /^###\s+Step\s+\d+[:\s]*(.+)$/gm;
  let match: RegExpExecArray | null;
  const positions: { title: string; start: number }[] = [];

  while ((match = stepRegex.exec(section)) !== null) {
    positions.push({ title: match[1].trim(), start: match.index + match[0].length });
  }

  for (let i = 0; i < positions.length; i++) {
    const end = i + 1 < positions.length ? positions[i + 1].start - positions[i + 1].title.length - 10 : section.length;
    const body = section.slice(positions[i].start, end).trim();
    steps.push({ title: positions[i].title, body });
  }

  return steps;
}

function extractTests(content: string): TestScenario[] {
  const section = extractSection(content, 'Test Scenarios');
  if (!section) return [];

  return section
    .split('\n')
    .filter(line => /^\s*[-*]/.test(line))
    .map(line => {
      const text = line.replace(/^\s*[-*]\s*/, '').trim();
      const idMatch = text.match(/^(TS-\d+):\s*(.+)$/);
      if (idMatch) {
        return { id: idMatch[1], description: idMatch[2] };
      }
      return { id: '', description: text };
    });
}
