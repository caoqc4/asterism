import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const productName = packageJson.productName ?? 'Asterism';
const legacyUserDataDirName = 'Taskplane';

function defaultUserDataPath() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', legacyUserDataDirName);
  }

  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), legacyUserDataDirName);
  }

  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), legacyUserDataDirName);
}

function fileStatus(filePath) {
  if (!fs.existsSync(filePath)) {
    return 'missing';
  }

  const stat = fs.statSync(filePath);
  return stat.isDirectory() ? 'directory' : `${stat.size} bytes`;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const envOverride = process.env.TASKPLANE_USER_DATA_DIR?.trim() || '';
const userDataPath = envOverride || defaultUserDataPath();
const configPath = path.join(userDataPath, 'config.json');
const dbPath = path.join(userDataPath, 'taskplane.db');
const walPath = `${dbPath}-wal`;
const shmPath = `${dbPath}-shm`;
const backupRoot = path.join(os.homedir(), `${productName} Backups`);
const backupPath = path.join(backupRoot, `${productName}-legacy-user-data-${new Date().toISOString().slice(0, 10)}`);

console.log(`${productName} real-use paths`);
console.log(`platform=${process.platform}`);
console.log(`defaultUserDataCompatibility=legacy ${legacyUserDataDirName} directory`);
console.log(`userDataOverride=${envOverride ? envOverride : '<none>'}`);
console.log(`userDataPath=${userDataPath}`);
console.log(`configPath=${configPath} (${fileStatus(configPath)})`);
console.log(`databasePath=${dbPath} (${fileStatus(dbPath)})`);
console.log(`databaseWalPath=${walPath} (${fileStatus(walPath)})`);
console.log(`databaseShmPath=${shmPath} (${fileStatus(shmPath)})`);
console.log('');

if (envOverride) {
  console.log('Warning: TASKPLANE_USER_DATA_DIR is set. Real daily use should usually launch without a temporary override.');
  console.log('');
}

console.log(`Suggested macOS backup command while ${productName} is closed:`);
console.log(`mkdir -p ${shellQuote(backupRoot)} && ditto ${shellQuote(userDataPath)} ${shellQuote(backupPath)}`);
console.log('');
console.log('Notes:');
console.log(`- Close ${productName} before copying taskplane.db, taskplane.db-wal, or taskplane.db-shm.`);
console.log('- API keys live in the OS keychain, not in config.json.');
