import { readFile } from "node:fs/promises";
import { makeTileFromPhonemes, parseSurfaceToPhonemes, surfaceDeva } from "../src/game/phonemes";
import { mergeTiles } from "../src/game/rules";
import type { RuleId, Tile } from "../src/game/types";

type DraftStep = {
  left: string;
  right: string;
  result: string;
  ruleId: RuleId;
};

type DraftTarget = {
  id: string;
  targetIAST: string;
  targetDeva: string;
  allowedRules: RuleId[];
  buildPaths: Array<{
    pathId: string;
    chunks: string[];
    steps: DraftStep[];
  }>;
};

type DraftPack = {
  packId: string;
  targets: DraftTarget[];
};

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: npm run validate:targets:draft -- <path-to-target-pack.draft.json>");
  process.exit(2);
}

try {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as DraftPack;
  const issues: string[] = [];

  if (!parsed.packId) issues.push("$.packId is required.");
  if (!Array.isArray(parsed.targets) || parsed.targets.length === 0) issues.push("$.targets must be a non-empty array.");

  const seenIds = new Set<string>();
  const ruleCounts = new Map<string, number>();

  for (const [targetIndex, target] of (parsed.targets ?? []).entries()) {
    const targetPath = `$.targets[${targetIndex}]`;
    if (!target.id) issues.push(`${targetPath}.id is required.`);
    if (seenIds.has(target.id)) issues.push(`${targetPath}.id duplicates ${target.id}.`);
    seenIds.add(target.id);

    validateSurface(target.targetIAST, `${targetPath}.targetIAST`, issues);
    const expectedDeva = safeSurfaceDeva(target.targetIAST);
    if (expectedDeva && target.targetDeva !== expectedDeva) {
      issues.push(`${targetPath}.targetDeva expected ${expectedDeva}, got ${target.targetDeva}.`);
    }

    if (!Array.isArray(target.allowedRules) || target.allowedRules.length === 0) {
      issues.push(`${targetPath}.allowedRules must be non-empty.`);
      continue;
    }

    for (const rule of target.allowedRules) ruleCounts.set(rule, (ruleCounts.get(rule) ?? 0) + 1);

    if (!Array.isArray(target.buildPaths) || target.buildPaths.length === 0) {
      issues.push(`${targetPath}.buildPaths must be non-empty.`);
      continue;
    }

    for (const [pathIndex, buildPath] of target.buildPaths.entries()) {
      const buildPathPath = `${targetPath}.buildPaths[${pathIndex}]`;
      const tiles = new Map<string, Tile>();

      for (const [chunkIndex, chunk] of buildPath.chunks.entries()) {
        const phonemes = validateSurface(chunk, `${buildPathPath}.chunks[${chunkIndex}]`, issues);
        if (phonemes) tiles.set(chunk, makeTileFromPhonemes(phonemes, { id: `${target.id}-${chunkIndex}` }));
      }

      for (const [stepIndex, step] of buildPath.steps.entries()) {
        const stepPath = `${buildPathPath}.steps[${stepIndex}]`;
        const left = tiles.get(step.left);
        const right = tiles.get(step.right);

        if (!left) issues.push(`${stepPath}.left ${step.left} is not available from chunks or prior steps.`);
        if (!right) issues.push(`${stepPath}.right ${step.right} is not available from chunks or prior steps.`);
        if (!left || !right) continue;

        const merged = mergeTiles(left, right, target.allowedRules, `${target.id}-${stepIndex}-result`);
        if (!merged) {
          issues.push(`${stepPath} does not merge under allowed rules ${target.allowedRules.join(", ")}.`);
          continue;
        }
        if (merged.match.ruleId !== step.ruleId) {
          issues.push(`${stepPath}.ruleId expected ${step.ruleId}, engine applied ${merged.match.ruleId}.`);
        }
        if (merged.result.surfaceIAST !== step.result) {
          issues.push(`${stepPath}.result expected ${step.result}, engine produced ${merged.result.surfaceIAST}.`);
        }
        tiles.set(step.result, merged.result);
      }

      const finalStep = buildPath.steps.at(-1);
      if (finalStep?.result !== target.targetIAST) {
        issues.push(`${buildPathPath} final step must produce targetIAST ${target.targetIAST}.`);
      }
    }
  }

  if (issues.length > 0) {
    console.error(`Target draft invalid: ${issues.length} issue${issues.length === 1 ? "" : "s"}.`);
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log(`Target draft valid: ${parsed.targets.length} targets accepted.`);
  console.log(`Rule coverage: ${Array.from(ruleCounts.entries()).map(([rule, count]) => `${rule}=${count}`).join(", ")}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function validateSurface(surface: string, path: string, issues: string[]) {
  try {
    return parseSurfaceToPhonemes(surface);
  } catch (error) {
    issues.push(`${path} is not parseable: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function safeSurfaceDeva(surface: string) {
  try {
    return surfaceDeva(parseSurfaceToPhonemes(surface));
  } catch {
    return null;
  }
}
