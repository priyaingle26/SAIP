import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'SAIP AI Scribe — EHR Autofill',
    description: 'Ambient listening and autofill overlay for Credible EHR, powered by SAIP AI Scribe.',
    version: '1.0.0',
    permissions: [
      'activeTab',
      'scripting',
      'storage',
      'offscreen',
      'sidePanel',
      'tabs',
      'webNavigation',
      'alarms',
    ],
    host_permissions: [
      'https://*.crediblebh.com/*',
      'https://*.thecrediblesolution.com/*',
      'http://localhost:*/*',
    ],
    side_panel: {
      default_path: 'sidepanel/index.html',
    },
    action: {
      default_title: 'Open SAIP',
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval' http://localhost:3000 http://localhost:3001; object-src 'self';"
    },
  },
  modules: ['@wxt-dev/module-react'],
});
