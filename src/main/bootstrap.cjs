globalThis.__TASKPLANE_ELECTRON__ = require('electron');

import('./index.js').catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
