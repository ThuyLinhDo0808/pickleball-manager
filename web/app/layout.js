// One typeface for the whole app, self-hosted (the CSP allows only our own fonts); it has
// the Vietnamese marks.
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { I18nProvider } from '@/context/I18nContext';
import { ClubProvider } from '@/context/ClubContext';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import ViewAsBanner from '@/components/ViewAsBanner';
import OnboardingGate from '@/components/OnboardingGate';
import MfaGate from '@/components/MfaGate';
import ConsentGate from '@/components/ConsentGate';
import EmailVerifyBanner from '@/components/EmailVerifyBanner';
import NavTracker from '@/components/NavTracker';
import MaintenanceGate from '@/components/MaintenanceGate';

export const metadata = {
  title: 'NexusZone',
  description: 'NexusZone - Where the Pickleball Community Connects',
  appleWebApp: { capable: true, title: 'NexusZone', statusBarStyle: 'black-translucent' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B1220',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <I18nProvider>
            <WorkspaceProvider>
              <ClubProvider>
                <NavTracker />
                <MaintenanceGate />
                <ViewAsBanner />
                <EmailVerifyBanner />
                <OnboardingGate />
                <MfaGate />
                <ConsentGate />
                {children}
              </ClubProvider>
            </WorkspaceProvider>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
