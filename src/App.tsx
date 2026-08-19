import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { CatalogAccessGate } from './components/CatalogAccessGate';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { DeviceFormPage } from './pages/DeviceFormPage';
import { InventoryPage } from './pages/InventoryPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="settings" element={<SettingsPage />} />
          <Route element={<CatalogAccessGate />}>
            <Route index element={<InventoryPage />} />
            <Route path="devices/new" element={<DeviceFormPage />} />
            <Route path="devices/:id" element={<DeviceDetailPage />} />
            <Route path="devices/:id/edit" element={<DeviceFormPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
