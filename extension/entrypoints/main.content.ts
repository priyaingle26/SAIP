export default defineContentScript({
  matches: [
    // `*.` already covers multi-level subdomains; `*.*.` is an invalid Chrome wildcard.
    'https://*.crediblebh.com/*',
    'https://*.thecrediblesolution.com/*',
  ],
  world: 'MAIN',
  allFrames: true,
  runAt: 'document_start',
  main() {
    console.log('[SAIP] Main-world content script loaded');
    window.addEventListener('SAIP_SYNC_CKEDITOR', () => {
      console.log('[SAIP] Syncing CKEditor instances in main world...');
      try {
        const ck = (window as unknown as Record<string, any>).CKEDITOR;
        if (ck && ck.instances) {
          for (const [key, instance] of Object.entries(ck.instances)) {
            const el = document.getElementById(key) || document.getElementsByName(key)[0];
            if (el && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) {
              const val = el.value;
              if (val !== (instance as any).getData()) {
                (instance as any).setData(val);
              }
            }
          }
        }
      } catch (err) {
        console.error('[SAIP] Error syncing CKEditor:', err);
      }
    });
  },
});
