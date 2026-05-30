const LOCAL_WEB_HOSTS = new Set(['localhost', '127.0.0.1']);

function shouldRegisterServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return false;
  }

  const { hostname, protocol } = window.location;
  const isLocalWebPreview = protocol === 'http:' && LOCAL_WEB_HOSTS.has(hostname);
  const isHostedHttps = protocol === 'https:' && !LOCAL_WEB_HOSTS.has(hostname);

  return isLocalWebPreview || isHostedHttps;
}

if (shouldRegisterServiceWorker()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
      registration.update().catch(() => undefined);
    }).catch(() => undefined);
  });
}
