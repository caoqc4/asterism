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
    PRODUCT_FEATURE_IMPACT_AUDIT,
    findProductFeatureImpactAuditIssues,
  } = await import(pathToFileURL(bundledPath).href);
  const issues = findProductFeatureImpactAuditIssues(PRODUCT_FEATURE_IMPACT_AUDIT);

  console.log('Taskplane product feature impact audit');
  console.log(`features=${PRODUCT_FEATURE_IMPACT_AUDIT.length}`);
  console.log(`status ${formatCounts(countBy(PRODUCT_FEATURE_IMPACT_AUDIT, 'status'))}`);
  console.log(`cliOnlyClosure ${formatCounts(countBy(PRODUCT_FEATURE_IMPACT_AUDIT, 'cliOnlyClosure'))}`);
  console.log(`futureApiClosure ${formatCounts(countBy(PRODUCT_FEATURE_IMPACT_AUDIT, 'futureApiClosure'))}`);

  for (const item of PRODUCT_FEATURE_IMPACT_AUDIT) {
    console.log(`${item.priority} ${item.status} cli=${item.cliOnlyClosure} api=${item.futureApiClosure} ${item.id}`);
  }

  if (includeNextActions) {
    console.log('openNextActions');
    for (const item of PRODUCT_FEATURE_IMPACT_AUDIT.filter((candidate) => candidate.status !== 'covered')) {
      console.log(`${item.id}`);
      console.log(`  gap=${item.gaps[0] ?? '<none>'}`);
      console.log(`  next=${item.nextActions[0] ?? '<none>'}`);
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
