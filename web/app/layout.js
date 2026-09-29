import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { I18nProvider } from '@/context/I18nContext';
import { ClubProvider } from '@/context/ClubContext';

export const metadata = {
  title: 'Pickleball Manager',
  description: 'Club + event management for pickleball hosts',
  appleWebApp: { capable: true, title: 'Pickleball', statusBarStyle: 'black-translucent' },
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
            <ClubProvider>{children}</ClubProvider>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
