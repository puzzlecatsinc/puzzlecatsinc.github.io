// Existing live GA4 identity/configuration only. Never send preview/test traffic.
const config = __ANALYTICS_CONFIG__;
if (config.allowedHosts.includes(location.hostname)) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const gtag = window.gtag;
  for (const [key, value] of Object.entries(config.sets)) gtag('set', key, value);
  gtag('js', new Date());
  gtag('config', config.measurementId);
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.measurementId)}`;
  document.head.append(script);
}
