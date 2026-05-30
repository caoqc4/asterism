import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-product-audit-'));
const bundledPath = path.join(tempRoot, 'product-feature-impact-audit.mjs');
const includeNextActions = process.argv.includes('--next');

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] ?? 'unknown';
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function formatCounts(counts) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

function idsFor(items, predicate) {
  const ids = items.filter(predicate).map((item) => item.id);
  return ids.length > 0 ? ids.join(',') : '<none>';
}

function isOptionalCompatibilityEvidence(item) {
  if (item.id !== 'smoke_tests_runtime_readiness_recovery') return false;
  const text = [
    ...item.gaps,
    ...item.nextActions,
  ].join(' ');
  return /optional|secondary compatibility|not (?:a )?mainline blocker|not as a mainline blocker/i.test(text);
}

function p0CliPartialIds(items) {
  return idsFor(
    items,
    (item) => item.priority === 'p0' && item.cliOnlyClosure === 'partial',
  );
}

function p0FutureApiPartialIds(items) {
  return idsFor(
    items,
    (item) => item.priority === 'p0' && item.futureApiClosure === 'partial',
  );
}

try {
  await build({
    bundle: true,
    entryPoints: [path.join(process.cwd(), 'src/shared/product-feature-impact-audit.ts')],
    format: 'esm',
    logLevel: 'silent',
    outfile: bundledPath,
    platform: 'node',
  });

  const {
    BUSINESS_LINE_FIRST_PRODUCT_AUDIT,
    BUSINESS_LINE_FIRST_RULE_LAYER_AUDIT,
    PRODUCT_FEATURE_IMPACT_AUDIT,
    findBusinessLineFirstProductAuditIssues,
    findBusinessLineFirstRuleLayerAuditIssues,
    findProductFeatureImpactAuditIssues,
  } = await import(pathToFileURL(bundledPath).href);
  const ruleLayerDocs = {
    agents_adapter: fs.readFileSync(path.join(process.cwd(), 'AGENTS.md'), 'utf8'),
    goalpilot: fs.readFileSync(path.join(process.cwd(), 'docs/specs/goalpilot-task-advancement-framework.md'), 'utf8'),
    memory_spec: fs.readFileSync(path.join(process.cwd(), 'docs/specs/task-memory-spec.md'), 'utf8'),
    handoff_policy: fs.readFileSync(path.join(process.cwd(), 'docs/specs/context-transition-policy.md'), 'utf8'),
    priority_routing: fs.readFileSync(path.join(process.cwd(), 'docs/specs/priority-attention-routing.md'), 'utf8'),
    runtime_orchestration: fs.readFileSync(path.join(process.cwd(), 'docs/specs/native-agent-runtime-orchestration.md'), 'utf8'),
  };
  const businessLineFirstRuleLayerIssues = findBusinessLineFirstRuleLayerAuditIssues(
    ruleLayerDocs,
    BUSINESS_LINE_FIRST_RULE_LAYER_AUDIT,
  );
  const issues = [
    ...findProductFeatureImpactAuditIssues(PRODUCT_FEATURE_IMPACT_AUDIT),
    ...findBusinessLineFirstProductAuditIssues(BUSINESS_LINE_FIRST_PRODUCT_AUDIT),
    ...businessLineFirstRuleLayerIssues,
  ];
  const businessLineFirstBlocked = idsFor(
    BUSINESS_LINE_FIRST_PRODUCT_AUDIT,
    (check) => check.status === 'blocked',
  );
  const businessLineFirstReady = businessLineFirstBlocked === '<none>' && businessLineFirstRuleLayerIssues.length === 0;

  console.log('Taskplane product feature impact audit');
  console.log(`features=${PRODUCT_FEATURE_IMPACT_AUDIT.length}`);
  console.log(`status ${formatCounts(countBy(PRODUCT_FEATURE_IMPACT_AUDIT, 'status'))}`);
  console.log(`cliOnlyClosure ${formatCounts(countBy(PRODUCT_FEATURE_IMPACT_AUDIT, 'cliOnlyClosure'))}`);
  console.log(`futureApiClosure ${formatCounts(countBy(PRODUCT_FEATURE_IMPACT_AUDIT, 'futureApiClosure'))}`);
  console.log(`businessLineFirst readiness=${businessLineFirstReady ? 'ready' : 'blocked'} checks=${BUSINESS_LINE_FIRST_PRODUCT_AUDIT.length} ${formatCounts(countBy(BUSINESS_LINE_FIRST_PRODUCT_AUDIT, 'status'))} blocked=${businessLineFirstBlocked}`);
  console.log(`businessLineFirstRules readiness=${businessLineFirstRuleLayerIssues.length === 0 ? 'ready' : 'blocked'} checks=${BUSINESS_LINE_FIRST_RULE_LAYER_AUDIT.length} issues=${businessLineFirstRuleLayerIssues.length}`);
  const p0CliPartial = p0CliPartialIds(PRODUCT_FEATURE_IMPACT_AUDIT);
  const p0FutureApiPartial = p0FutureApiPartialIds(PRODUCT_FEATURE_IMPACT_AUDIT);
  console.log(`summary mainlineCliP0=${p0CliPartial === '<none>' ? 'ready' : 'blocked'} p0CliPartial=${p0CliPartial} p0FutureApiDeferred=${p0FutureApiPartial}`);
  console.log(`currentCompletion p0Cli=${p0CliPartial === '<none>' ? 'ready' : 'blocked'} p0CurrentBlockers=${p0CliPartial} futureApiDeferred=${p0FutureApiPartial}`);
  console.log(`focus p0CliPartial=${p0CliPartial}`);
  console.log(`focus p0FutureApiPartial=${p0FutureApiPartial}`);
  console.log(`focus p1CliPartial=${idsFor(
    PRODUCT_FEATURE_IMPACT_AUDIT,
    (item) => item.priority === 'p1' && item.cliOnlyClosure === 'partial',
  )}`);

  for (const item of PRODUCT_FEATURE_IMPACT_AUDIT) {
    console.log(`${item.priority} ${item.status} cli=${item.cliOnlyClosure} api=${item.futureApiClosure} ${item.id}`);
  }
  console.log('businessLineFirstChecks');
  for (const check of BUSINESS_LINE_FIRST_PRODUCT_AUDIT) {
    console.log(`${check.status} ${check.id}`);
  }
  console.log('businessLineFirstRuleChecks');
  for (const check of BUSINESS_LINE_FIRST_RULE_LAYER_AUDIT) {
    console.log(`ready ${check.id} doc=${check.docId}`);
  }

  if (includeNextActions) {
    const openItems = PRODUCT_FEATURE_IMPACT_AUDIT.filter((candidate) => (
      candidate.status !== 'covered' && !isOptionalCompatibilityEvidence(candidate)
    ));
    const optionalItems = PRODUCT_FEATURE_IMPACT_AUDIT.filter((candidate) => (
      candidate.status !== 'covered' && isOptionalCompatibilityEvidence(candidate)
    ));

    console.log('openNextActions');
    for (const item of openItems) {
      console.log(`${item.id}`);
      console.log(`  gap=${item.gaps[0] ?? '<none>'}`);
      console.log(`  next=${item.nextActions[0] ?? '<none>'}`);
    }
    if (optionalItems.length > 0) {
      console.log('optionalCompatibilityEvidence');
      for (const item of optionalItems) {
        console.log(`${item.id}`);
        console.log(`  gap=${item.gaps[0] ?? '<none>'}`);
        console.log(`  next=${item.nextActions[0] ?? '<none>'}`);
      }
    }
  }

  if (issues.length > 0) {
    console.error('issues');
    for (const issue of issues) {
      console.error(`${issue.featureId}: ${issue.issue}`);
    }
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
