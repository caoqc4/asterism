#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { envValue, parseEnvFile } from './provider-native-live-preflight.mjs';

const DEFAULT_QUERY = 'newer_than:7d';
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_LIMIT = 25;

export function getGmailConnectorPreflight() {
  const envPath = process.env.TASKPLANE_ENV_FILE
    ? path.resolve(process.env.TASKPLANE_ENV_FILE)
    : path.join(process.cwd(), '.env');
  const values = parseEnvFile(envPath);
  const accessToken = envValue(values, 'TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCESS_TOKEN');
  const oauthClientId = envValue(values, 'TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID');
  const oauthClientSecret = envValue(values, 'TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_SECRET');
  const account = envValue(values, 'TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT');
  const query = envValue(values, 'TASKPLANE_EXTERNAL_ACCESS_GMAIL_QUERY') || DEFAULT_QUERY;
  const rawMaxResults = envValue(values, 'TASKPLANE_EXTERNAL_ACCESS_GMAIL_MAX_RESULTS');
  const maxResults = rawMaxResults ? Number(rawMaxResults) : DEFAULT_MAX_RESULTS;
  const issues = [];

  if (!accessToken && !oauthClientId) {
    issues.push('Configure either TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCESS_TOKEN or TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID.');
  }

  if (rawMaxResults && (!Number.isFinite(maxResults) || maxResults < 1 || maxResults > MAX_RESULTS_LIMIT)) {
    issues.push(`TASKPLANE_EXTERNAL_ACCESS_GMAIL_MAX_RESULTS must be between 1 and ${MAX_RESULTS_LIMIT}.`);
  }

  if (query.length > 500) {
    issues.push('TASKPLANE_EXTERNAL_ACCESS_GMAIL_QUERY is too long for a local connector preflight.');
  }

  return {
    account,
    envPath,
    hasAccessToken: Boolean(accessToken),
    hasOAuthClientId: Boolean(oauthClientId),
    hasOAuthClientSecret: Boolean(oauthClientSecret),
    issues,
    maxResults: Number.isFinite(maxResults)
      ? Math.max(1, Math.min(MAX_RESULTS_LIMIT, Math.trunc(maxResults)))
      : DEFAULT_MAX_RESULTS,
    query,
    ready: issues.length === 0,
  };
}

export function printGmailConnectorPreflight(result) {
  console.log('Gmail connector preflight');
  console.log(`envFile=${fs.existsSync(result.envPath) ? result.envPath : '<missing>'}`);
  console.log(`accessToken=${result.hasAccessToken ? '<set>' : '<empty>'}`);
  console.log(`oauthClientId=${result.hasOAuthClientId ? '<set>' : '<empty>'}`);
  console.log(`oauthClientSecret=${result.hasOAuthClientSecret ? '<set>' : '<empty>'}`);
  console.log(`account=${result.account || '<empty>'}`);
  console.log(`query=${result.query || '<empty>'}`);
  console.log(`maxResults=${result.maxResults}`);

  if (!result.ready) {
    console.log('status=skip');
    console.log('skipReason=config_missing');
    for (const issue of result.issues) {
      console.log(`- ${issue}`);
    }
    console.log('No Gmail request or task memory write was performed.');
    return;
  }

  console.log('status=ready');
  console.log('No Gmail request or task memory write was performed.');
  console.log('A later explicit Gmail source-ingestion action may call Gmail with the configured access token or stored OAuth refresh token.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printGmailConnectorPreflight(getGmailConnectorPreflight());
}
