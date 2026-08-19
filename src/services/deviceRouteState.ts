export type DeviceRouteState = {
  inventoryId: string;
};

export function deviceLinkState(inventoryId: string): DeviceRouteState {
  return { inventoryId };
}
