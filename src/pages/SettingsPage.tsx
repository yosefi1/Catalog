import { useEffect, useRef, useState } from 'react';
import {
  exportBackupZip,
  importBackupMerge,
  importBackupReplace,
  parseBackupFile,
  type BackupPreview,
} from '../services/backup';
import { testConnection } from '../services/catalogApi';
import { getAccessKey, setAccessKey } from '../services/accessKey';
import { countLocalDevices, countLocalPhotos, migrateLocalToServer } from '../services/localMigration';
import { exportInventoryPackage } from '../services/exportCatalog';
import {
  getStorageStats,
  type StorageStats,
} from '../services/storageStats';

export function SettingsPage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [localCount, setLocalCount] = useState(0);
  const [localPhotoCount, setLocalPhotoCount] = useState(0);
  const [keyDraft, setKeyDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setStats(await getStorageStats());
    setKeyDraft(getAccessKey());
    setLocalCount(await countLocalDevices());
    setLocalPhotoCount(await countLocalPhotos());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setStatus(label);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page settings-page">
      <div className="page-heading">
        <h1>Data & Settings</h1>
        <p>Server storage + tools</p>
      </div>

      <section className="stats-cards">
        <div className="stat-card">
          <strong>{stats?.deviceCount ?? '…'}</strong>
          <span>Devices on server</span>
        </div>
        <div className="stat-card">
          <strong>{localCount}</strong>
          <span>Old local devices</span>
        </div>
        <div className="stat-card">
          <strong>{localPhotoCount}</strong>
          <span>Old local photos</span>
        </div>
      </section>

      <section className="settings-section">
        <h2>Server connection</h2>
        <p className="muted">
          All devices and photos load from Supabase via the API. Same access key on every device
          (no login).
        </p>

        <label className="field">
          <span className="field__label">Access key</span>
          <input
            className="field__input"
            type="password"
            autoComplete="off"
            value={keyDraft}
            placeholder="CATALOG_ACCESS_KEY from Vercel"
            onChange={(e) => setKeyDraft(e.target.value)}
          />
        </label>

        <div className="confirm-row">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={() =>
              void run('Saving…', async () => {
                setAccessKey(keyDraft);
                setStatus('Access key saved — reload inventory to connect');
              })
            }
          >
            Save key
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !keyDraft.trim()}
            onClick={() =>
              void run('Testing…', async () => {
                setAccessKey(keyDraft);
                setStatus(await testConnection());
              })
            }
          >
            Test connection
          </button>
        </div>
      </section>

      {(localCount > 0 || localPhotoCount > 0) && (
        <section className="settings-section">
          <h2>Restore from this browser</h2>
          <p className="muted">
            {localCount} device(s) and {localPhotoCount} photo(s) saved in this browser from before.
            Uploads missing devices and photos to the server (keeps what is already complete).
          </p>
          <button
            type="button"
            className="btn btn--primary btn--large"
            disabled={busy || !keyDraft.trim()}
            onClick={() =>
              void run('Uploading local data…', async () => {
                setAccessKey(keyDraft);
                const result = await migrateLocalToServer((msg) => setStatus(msg));
                setStatus(
                  `Done — uploaded ${result.uploaded} devices, ${result.photos} photos (${result.skipped} skipped)`,
                );
              })
            }
          >
            Upload / restore to server
          </button>
        </section>
      )}

      <section className="settings-section">
        <h2>Export backup (ZIP)</h2>
        <p className="muted">
          Download a ZIP snapshot from the server (when connected).
        </p>
        <button
          type="button"
          className="btn btn--secondary btn--large"
          disabled={busy}
          onClick={() =>
            void run('Creating backup…', async () => {
              await exportBackupZip();
              setStatus('Backup ready — save/share the ZIP file');
            })
          }
        >
          Export Backup
        </button>
      </section>

      <section className="settings-section">
        <h2>Export HTML catalog (for browsing)</h2>
        <p className="muted">
          Offline HTML + photos + Excel for viewing on a PC. This is{' '}
          <strong>not</strong> the restore backup (unless you import it as a package).
        </p>
        <button
          type="button"
          className="btn btn--secondary btn--large"
          disabled={busy || !stats?.deviceCount}
          onClick={() =>
            void run('Exporting inventory…', async () => {
              await exportInventoryPackage((msg) => setStatus(msg));
              setStatus('Inventory catalog ZIP ready');
            })
          }
        >
          Export Inventory Package
        </button>
      </section>

      <section className="settings-section">
        <h2>Import Backup</h2>
        <p className="muted">
          Accepts Backup ZIP (<code>backup.json</code>) or Inventory Package ZIP (
          <code>inventory.json</code> + images).
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void (async () => {
              setBusy(true);
              setStatus('Reading backup…');
              try {
                const p = await parseBackupFile(file);
                setPreview(p);
                setStatus(
                  `${p.sourceLabel}: ${p.deviceCount} devices, ${p.photoCount} photos`,
                );
              } catch (err) {
                setStatus(err instanceof Error ? err.message : 'Invalid backup');
                setPreview(null);
              } finally {
                setBusy(false);
                if (fileRef.current) fileRef.current.value = '';
              }
            })();
          }}
        />
        <button
          type="button"
          className="btn btn--secondary btn--large"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Choose Backup / Inventory ZIP
        </button>

        {preview && (
          <div className="import-preview">
            <p className="muted small">{preview.sourceLabel}</p>
            <p>
              <strong>{preview.deviceCount}</strong> devices ·{' '}
              <strong>{preview.photoCount}</strong> photos
            </p>
            <div className="confirm-row">
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() =>
                  void run('Replacing database…', async () => {
                    await importBackupReplace(preview.payload);
                    setPreview(null);
                    setStatus('Database replaced from backup');
                  })
                }
              >
                Replace existing database
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() =>
                  void run('Merging backup…', async () => {
                    const result = await importBackupMerge(preview.payload);
                    setPreview(null);
                    setStatus(
                      `Merged: ${result.imported} imported` +
                        (result.remapped
                          ? ` (${result.remapped} remapped to new IDs)`
                          : ''),
                    );
                  })
                }
              >
                Merge into current database
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setPreview(null)}
              >
                Cancel
              </button>
            </div>
            <p className="muted small">
              Merge keeps your current data. Duplicate Inventory IDs are imported
              as new EQ-#### numbers.
            </p>
          </div>
        )}
      </section>

      {status && <p className="status-banner">{status}</p>}
    </div>
  );
}
