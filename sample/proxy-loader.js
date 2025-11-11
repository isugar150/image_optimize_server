const PROXY_BASE_URL = window.PROXY_BASE_URL || 'http://localhost:3000';

const toPositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const buildProxyUrl = (originUrl, { width, height, referer }) => {
  const endpoint = new URL('/', PROXY_BASE_URL);
  endpoint.searchParams.set('u', originUrl);
  if (width) endpoint.searchParams.set('w', String(width));
  if (height) endpoint.searchParams.set('h', String(height));
  if (referer) endpoint.searchParams.set('ref', referer);
  return endpoint.toString();
};

const hydrateImages = () => {
  document.querySelectorAll('img[data-origin]').forEach((img) => {
    const origin = img.getAttribute('data-origin');
    if (!origin) return;

    const width = toPositiveInt(img.getAttribute('data-width'));
    const height = toPositiveInt(img.getAttribute('data-height'));
    const referer = img.getAttribute('data-referer') || undefined;

    const proxyUrl = buildProxyUrl(origin, { width, height, referer });

    img.addEventListener('error', () => {
      // Surface the failing URL so the developer can debug quickly.
      console.warn('[proxy-loader] failed to load optimized image', { proxyUrl });
    }, { once: true });

    img.src = proxyUrl;
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrateImages);
} else {
  hydrateImages();
}
