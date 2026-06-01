globalThis.__TASKPLANE_ELECTRON__ = require('electron');

if (process.env.TASKPLANE_RUNTIME_SMOKE_PATH) {
  require('node:fs').appendFileSync(
    process.env.TASKPLANE_RUNTIME_SMOKE_PATH,
    'bootstrap:start\n',
    'utf8',
  );
}

const keepAlive = setInterval(() => {}, 1_000);

import('./index.js')
  .then(() => {
    if (process.env.TASKPLANE_RUNTIME_SMOKE_PATH) {
      require('node:fs').appendFileSync(
        process.env.TASKPLANE_RUNTIME_SMOKE_PATH,
        'bootstrap:imported\n',
        'utf8',
      );
    }
    clearInterval(keepAlive);
  })
  .catch((error) => {
    if (process.env.TASKPLANE_RUNTIME_SMOKE_PATH) {
      require('node:fs').appendFileSync(
        process.env.TASKPLANE_RUNTIME_SMOKE_PATH,
        `bootstrap:error:${error instanceof Error ? error.stack : String(error)}\n`,
        'utf8',
      );
    }
    clearInterval(keepAlive);
    console.error(error);
    process.exitCode = 1;
  });
