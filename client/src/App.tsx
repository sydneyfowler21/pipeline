import { useEffect } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { screenshotRequested } from '@/lib/copy';
import { GuestOnly, Shell } from '@/components/shell';
import { ForgotPage, ResetPage, SignInPage, SignUpPage, VerifyPage } from '@/pages/auth';
import { ListPage } from '@/pages/list';
import { ApplicationFormPage } from '@/pages/form';
import { DetailPage } from '@/pages/detail';
import { PreferencesPage, SecurityPage } from '@/pages/settings';

function ScreenshotFlag() {
  const [params] = useSearchParams();
  useEffect(() => {
    const enabled = screenshotRequested(import.meta.env.MODE, params.get('screenshot'));
    if (enabled) document.documentElement.dataset.screenshot = '1';
    else delete document.documentElement.dataset.screenshot;
    return () => {
      delete document.documentElement.dataset.screenshot;
    };
  }, [params]);
  return null;
}

export function App() {
  return (
    <>
      <ScreenshotFlag />
      <Routes>
        <Route
          path="/"
          element={
            <GuestOnly>
              <SignInPage />
            </GuestOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestOnly>
              <SignUpPage />
            </GuestOnly>
          }
        />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/verify-email" element={<VerifyPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/reset" element={<ResetPage />} />
        <Route path="/reset-password" element={<ResetPage />} />
        <Route element={<Shell />}>
          <Route path="/applications" element={<ListPage />} />
          <Route path="/applications/new" element={<ApplicationFormPage />} />
          <Route path="/applications/:id" element={<DetailPage />} />
          <Route path="/applications/:id/edit" element={<ApplicationFormPage />} />
          <Route path="/settings" element={<Navigate to="/settings/security" replace />} />
          <Route path="/settings/security" element={<SecurityPage />} />
          <Route path="/settings/preferences" element={<PreferencesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
