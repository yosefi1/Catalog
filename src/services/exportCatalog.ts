import { getAllDevices } from '../db/devices';
import { fetchDevice } from './catalogApi';
import { PHOTO_TYPE_LABELS, type PhotoType } from '../types/device';
import {
  buildCatalogHtml,
  type ExportCatalogData,
  type ExportDeviceRecord,
} from './exportCatalogHtml';
import { saveBlobAsFile, todayStamp } from './utils';

const PHOTO_FILE_NAMES: Record<PhotoType, string> = {
  main: 'main.jpg',
  model_label: 'model.jpg',
  serial_label: 'serial.jpg',
  asset_tag: 'asset.jpg',
  additional: 'extra',
};

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

export async function exportInventoryPackage(
  onProgress?: (message: string) => void,
): Promise<void> {
  const [{ default: JSZip }, XLSX] = await Promise.all([
    import('jszip'),
    import('xlsx'),
  ]);

  onProgress?.('Loading devices…');
  const devices = await getAllDevices();
  const stamp = todayStamp();
  const zip = new JSZip();
  const root = zip.folder('EquipmentInventory');
  if (!root) throw new Error('Failed to create ZIP folder');

  const images = root.folder('images');
  if (!images) throw new Error('Failed to create images folder');

  const exportDevices: ExportDeviceRecord[] = [];
  const jsonDevices: Array<Record<string, unknown>> = [];

  for (const device of devices) {
    onProgress?.(`Packaging ${device.inventoryId}…`);
    const full = await fetchDevice(device.inventoryId);
    const photos = [...full.photos].sort((a, b) => a.createdAt - b.createdAt);

    const deviceFolder = images.folder(device.inventoryId);
    if (!deviceFolder) continue;

    const photoRefs: ExportDeviceRecord['photos'] = [];
    let extraIndex = 0;
    let thumbPath: string | null = null;

    for (const photo of photos) {
      const blob = await fetch(photo.url).then((r) => r.blob());
      const ext = extFromMime(photo.mimeType);
      let fileName: string;
      if (photo.photoType === 'additional') {
        extraIndex += 1;
        fileName = `extra_${String(extraIndex).padStart(2, '0')}.${ext}`;
      } else {
        const base = PHOTO_FILE_NAMES[photo.photoType].replace(/\.jpg$/, '');
        fileName = `${base}.${ext}`;
      }

      deviceFolder.file(fileName, blob);
      const relPath = `images/${device.inventoryId}/${fileName}`;
      photoRefs.push({
        photoType: photo.photoType,
        label: PHOTO_TYPE_LABELS[photo.photoType],
        path: relPath,
      });

      if (photo.photoType === 'main' && !thumbPath) thumbPath = relPath;
    }

    if (!thumbPath && photoRefs.length) thumbPath = photoRefs[0].path;

    exportDevices.push({
      inventoryId: device.inventoryId,
      deviceName: device.deviceName,
      manufacturer: device.manufacturer,
      model: device.model,
      serialNumber: device.serialNumber,
      assetTag: device.assetTag,
      deviceType: device.deviceType,
      location: device.location,
      room: device.room,
      area: device.area,
      owner: device.owner,
      notes: device.notes,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
      photos: photoRefs,
      thumbPath,
    });

    jsonDevices.push({
      inventoryId: device.inventoryId,
      deviceName: device.deviceName,
      manufacturer: device.manufacturer,
      model: device.model,
      serialNumber: device.serialNumber,
      assetTag: device.assetTag,
      deviceType: device.deviceType,
      location: device.location,
      room: device.room,
      area: device.area,
      owner: device.owner,
      notes: device.notes,
      createdAt: new Date(device.createdAt).toISOString(),
      updatedAt: new Date(device.updatedAt).toISOString(),
      photos: photoRefs.map((p) => ({
        type: p.photoType,
        label: p.label,
        path: p.path,
      })),
    });
  }

  onProgress?.('Building catalog HTML…');
  const catalogData: ExportCatalogData = {
    title: 'Equipment Inventory',
    exportedAt: new Date().toISOString(),
    devices: exportDevices,
  };
  root.file('index.html', buildCatalogHtml(catalogData));
  root.file(
    'inventory.json',
    JSON.stringify(
      { exportedAt: catalogData.exportedAt, devices: jsonDevices },
      null,
      2,
    ),
  );

  onProgress?.('Building Excel file…');
  const sheetRows = exportDevices.map((d) => ({
    'Inventory ID': d.inventoryId,
    'Device Name': d.deviceName,
    Manufacturer: d.manufacturer,
    Model: d.model,
    'Serial Number': d.serialNumber,
    'Asset Tag': d.assetTag,
    'Device Type': d.deviceType,
    Location: d.location,
    Room: d.room,
    Area: d.area,
    Owner: d.owner,
    Notes: d.notes,
    'Created At': new Date(d.createdAt).toISOString(),
    'Updated At': new Date(d.updatedAt).toISOString(),
    Photos: d.photos.length,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  const xlsxArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  root.file('inventory.xlsx', xlsxArray);

  onProgress?.('Compressing ZIP…');
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  await saveBlobAsFile(blob, `EquipmentInventory_${stamp}.zip`);
  onProgress?.('Done');
}
