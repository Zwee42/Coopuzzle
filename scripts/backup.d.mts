export interface BackupResult {
  outDir: string;
  createdAt: string;
  sourceDataDir: string;
  databaseBytes: number;
  uploadFiles: number;
}

export function createBackup(options: { dataDir: string; outDir: string }): Promise<BackupResult>;

export function restoreBackup(options: {
  backupDir: string;
  dataDir: string;
}): Promise<{ dataDir: string }>;
