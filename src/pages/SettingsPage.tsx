import { useEffect, useRef, useState } from 'react';
import {
  exportBackupZip,
  importBackupMerge,
  importBackupReplace,
  parseBackupFile,
  type BackupPreview,
} from '../services/backup';
import { exportInventoryPackage } from '../services/exportCatalog';
import { clearAllData } from '../db/devices';
import {
  getStorageStats,
  requestPersistentStorage,
  type StorageStats,
} from '../services/storageStats';

export function SettingsPage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setStats(await getStorageStats());
  }

  useEffect(() => {
    void refresh();
    void requestPersistentStorage().then(setPersisted);
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
        <p>Local-only storage on this device</p>
      </div>

      <section className="stats-cards">
        <div className="stat-card">
          <strong>{stats?.deviceCount ?? '…'}</strong>
          <span>Devices</span>
        </div>
        <div className="stat-card">
          <strong>{stats?.photoCount ?? '…'}</strong>
          <span>Photos</span>
        </div>
        <div className="stat-card">
          <strong>{stats?.approxLabel ?? '…'}</strong>
          <span>Approx. storage</span>
        </div>
      </section>

      {persisted !== null && (
        <p className="muted small">
          Persistent storage:{' '}
          {persisted
            ? 'Granted (harder for the browser to clear)'
            : 'Not granted — export backups regularly'}
        </p>
      )}

      <section className="settings-section">
        <h2>Move to another device</h2>
        <p className="muted">
          Use <strong>Export Backup</strong> on iPhone, then AirDrop / Files the ZIP to
          your PC and import it here. This includes all photos.
        </p>
        <button
          type="button"
          className="btn btn--primary btn--large"
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

      <section className="settings-section danger-zone">
        <h2>Delete All Data</h2>
        {!confirmDelete ? (
          <button
            type="button"
            className="btn btn--danger btn--large"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            Delete All Data
          </button>
        ) : (
          <div className="confirm-row">
            <p>This permanently deletes all devices, photos, and drafts.</p>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() =>
                void run('Deleting…', async () => {
                  await clearAllData();
                  setConfirmDelete(false);
                  setStatus('All data deleted');
                })
              }
            >
              Yes, delete everything
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      {status && <p className="status-banner">{status}</p>}
    </div>
  );
}
