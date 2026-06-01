import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type GmailOAuthLoopbackListenerOptions = {
  host?: string;
  path?: string;
  timeoutMs?: number;
};

export type GmailOAuthLoopbackListener = {
  redirectUri: string;
  close(): Promise<void>;
  waitForCallback(expectedState: string): Promise<{ code: string; state: string }>;
};

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PATH = '/oauth/gmail/callback';
const DEFAULT_TIMEOUT_MS = 120_000;

export async function createGmailOAuthLoopbackListener(
  options: GmailOAuthLoopbackListenerOptions = {},
): Promise<GmailOAuthLoopbackListener> {
  const host = options.host ?? DEFAULT_HOST;
  const callbackPath = options.path ?? DEFAULT_PATH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const server = createServer();

  await listen(server, host);
  const address = server.address() as AddressInfo;
  const redirectUri = `http://${host}:${address.port}${callbackPath}`;

  return {
    redirectUri,
    close: () => close(server),
    waitForCallback: (expectedState) => waitForCallback({
      server,
      host,
      callbackPath,
      expectedState,
      timeoutMs,
    }),
  };
}

function waitForCallback(input: {
  server: Server;
  host: string;
  callbackPath: string;
  expectedState: string;
  timeoutMs: number;
}): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const expectedState = input.expectedState.trim();
    if (!expectedState) {
      reject(new Error('Gmail OAuth expected state is empty.'));
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Gmail OAuth loopback callback timed out.'));
    }, input.timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      input.server.removeListener('request', onRequest);
      void close(input.server);
    };

    const onRequest = (request: IncomingMessage, response: ServerResponse) => {
      try {
        const url = new URL(request.url ?? '/', `http://${input.host}`);
        if (url.pathname !== input.callbackPath) {
          response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          response.end('Not found.');
          return;
        }

        const state = url.searchParams.get('state')?.trim() ?? '';
        const code = url.searchParams.get('code')?.trim() ?? '';
        const error = url.searchParams.get('error')?.trim();

        if (error) {
          response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
          response.end('<!doctype html><p>Authorization was not completed. You can close this window.</p>');
          cleanup();
          reject(new Error(`Gmail OAuth authorization failed: ${error}`));
          return;
        }

        if (state !== expectedState) {
          response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
          response.end('<!doctype html><p>Authorization state did not match. You can close this window.</p>');
          cleanup();
          reject(new Error('Gmail OAuth callback state did not match.'));
          return;
        }

        if (!code) {
          response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
          response.end('<!doctype html><p>Authorization code was missing. You can close this window.</p>');
          cleanup();
          reject(new Error('Gmail OAuth callback did not include an authorization code.'));
          return;
        }

        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><p>Authorization complete. You can close this window and return to Taskplane.</p>');
        cleanup();
        resolve({ code, state });
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    input.server.on('request', onRequest);
  });
}

function listen(server: Server, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
