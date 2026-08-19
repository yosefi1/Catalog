export type PhotoType =
  | 'main'
  | 'model_label'
  | 'serial_label'
  | 'asset_tag'
  | 'additional';

export const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  main: 'Main Photo',
  model_label: 'Model Label',
  serial_label: 'Serial Label',
  asset_tag: 'Asset Tag',
  additional: 'Additional Photo',
};

export const PHOTO_TYPES: PhotoType[] = [
  'main',
  'model_label',
  'serial_label',
  'asset_tag',
  'additional',
];

/** Gallery order: main first, then serial, then other labels, additional last. */
export const PHOTO_DISPLAY_ORDER: PhotoType[] = [
  'main',
  'serial_label',
  'model_label',
  'asset_tag',
  'additional',
];

export function sortPhotosForDisplay<
  T extends { photoType: PhotoType; createdAt: number },
>(photos: T[]): T[] {
  return [...photos].sort((a, b) => {
    const ai = PHOTO_DISPLAY_ORDER.indexOf(a.photoType);
    const bi = PHOTO_DISPLAY_ORDER.indexOf(b.photoType);
    const aRank = ai === -1 ? PHOTO_DISPLAY_ORDER.length : ai;
    const bRank = bi === -1 ? PHOTO_DISPLAY_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.createdAt - b.createdAt;
  });
}

/** Single-slot types: only one photo of this type per device (except additional). */
export const SINGLE_PHOTO_TYPES: PhotoType[] = [
  'main',
  'model_label',
  'serial_label',
  'asset_tag',
];

export interface Device {
  id?: number;
  inventoryId: string;
  deviceName: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  deviceType: string;
  location: string;
  room: string;
  area: string;
  owner: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type DeviceInput = Omit<Device, 'id' | 'inventoryId' | 'createdAt' | 'updatedAt'> & {
  inventoryId?: string;
};

export interface DevicePhoto {
  id?: number;
  deviceId: number;
  photoType: PhotoType;
  /** Blob stored in IndexedDB — never localStorage */
  blob: Blob;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: number;
  /** Optional OCR raw text for future use */
  ocrRawText?: string;
}

export interface DeviceDraft {
  id: string; // 'new' or device id string
  form: DeviceFormState;
  photos: DraftPhoto[];
  updatedAt: number;
}

export interface DeviceFormState {
  deviceName: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  deviceType: string;
  location: string;
  room: string;
  area: string;
  owner: string;
  notes: string;
}

export interface DraftPhoto {
  localId: string;
  photoType: PhotoType;
  blob: Blob;
  mimeType: string;
  previewUrl: string;
  createdAt: number;
  /** If editing: existing DB photo id to keep/replace */
  existingPhotoId?: number;
}

export interface DeviceWithPhotos extends Device {
  photos: DevicePhoto[];
}

export interface DeviceListItem extends Device {
  thumbnailUrl?: string;
  mainPhotoId?: number;
}

export type SortField =
  | 'inventoryId'
  | 'deviceName'
  | 'manufacturer'
  | 'model'
  | 'serialNumber'
  | 'location'
  | 'createdAt'
  | 'updatedAt';

export type SortDirection = 'asc' | 'desc';

export interface InventoryFilters {
  search: string;
  location: string;
  manufacturer: string;
  deviceType: string;
  room: string;
  sortBy: SortField;
  sortDir: SortDirection;
}

export function emptyDeviceForm(
  defaults?: Partial<DeviceFormState>,
): DeviceFormState {
  return {
    deviceName: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    assetTag: '',
    deviceType: '',
    location: '',
    room: '',
    area: '',
    owner: '',
    notes: '',
    ...defaults,
  };
}

export function deviceToForm(device: Device): DeviceFormState {
  return {
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
  };
}
