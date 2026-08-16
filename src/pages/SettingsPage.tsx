import { useEffect, useRef, useState } from 'react';
import {
  exportBackupZip,
  importBackupMerge,
  importBackupReplace,
  parseBackupFile,
  type BackupPreview,
} from '../services/backup';
import {
  getSyncSettings,
  runFullSync,
  saveSyncSettings,
  type SyncSettings,
} from '../services/cloudSync';
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
  const [sync, setSync] = useState<SyncSettings | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setStats(await getStorageStats());
    const s = await getSyncSettings();
    setSync(s);
    setKeyDraft(s.accessKey);
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
        <p>Local store + optional cloud sync</p>
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
            : 'Not granted — enable cloud sync or export backups'}
        </p>
      )}

      <section className="settings-section">
        <h2>Cloud sync</h2>
        <p className="muted">
          Shared secret key (no login). Same key on iPhone and PC. Data stays in
          your Supabase project; the browser never gets the service role key.
        </p>

        <label className="field">
          <span className="field__label">Catalog sync key</span>
          <input
            className="field__input"
            type="password"
            autoComplete="off"
            value={keyDraft}
            placeholder="Paste the same long secret used in Vercel"
            onChange={(e) => setKeyDraft(e.target.value)}
          />
        </label>

        <label className="sync-toggle">
          <input
            type="checkbox"
            checked={Boolean(sync?.enabled)}
            disabled={busy}
            onChange={(e) => {
              void (async () => {
                await saveSyncSettings({
                  accessKey: keyDraft,
                  enabled: e.target.checked,
                });
                await refresh();
                setStatus(
                  e.target.checked
                    ? 'Cloud sync enabled'
                    : 'Cloud sync disabled',
                );
              })();
            }}
          />
          <span>Enable automatic cloud sync</span>
        </label>

        <div className="confirm-row">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={() =>
              void run('Saving key…', async () => {
                await saveSyncSettings({ accessKey: keyDraft });
                setStatus('Sync key saved on this device');
              })
            }
          >
            Save key
          </button>
          <button
            type="button"
            className="btn btn--primary btn--large"
            disabled={busy || !keyDraft.trim()}
            onClick={() =>
              void run('Syncing with cloud…', async () => {
                await saveSyncSettings({
                  accessKey: keyDraft,
                  enabled: true,
                });
                const result = await runFullSync();
                setStatus(result.message);
                if (!result.ok) throw new Error(result.message);
              })
            }
          >
            Sync now
          </button>
        </div>

        {sync?.lastSyncAt && (
          <p className="muted small">
            Last sync: {new Date(sync.lastSyncAt).toLocaleString()}
            {sync.lastMessage ? ` — ${sync.lastMessage}` : ''}
          </p>
        )}
        {sync?.lastError && (
          <p className="error-text small">{sync.lastError}</p>
        )}
      </section>

      <section className="settings-section">
        <h2>Move to another device (ZIP)</h2>
        <p className="muted">
          Offline fallback: <strong>Export Backup</strong>, then AirDrop / Files
          the ZIP and import on the other device.
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
