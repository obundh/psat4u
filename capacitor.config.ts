import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.psat4u.app',
  appName: 'PSAT4U',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
