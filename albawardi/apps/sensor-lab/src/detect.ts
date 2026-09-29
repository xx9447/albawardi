// Browser + in-app detection (design doc §3): TikTok/Instagram/Snapchat/Telegram
// in-app browsers can't be trusted with sensors — detect and say so.

export interface BrowserInfo {
  name: string;
  inApp: string | null;
  userAgent: string;
  platform: string;
}

export function detectBrowser(): BrowserInfo {
  const ua = navigator.userAgent;
  let name = 'Unknown';
  if (/CriOS/i.test(ua)) name = 'Chrome (iOS)';
  else if (/FxiOS/i.test(ua)) name = 'Firefox (iOS)';
  else if (/EdgiOS|Edg/i.test(ua)) name = 'Edge';
  else if (/SamsungBrowser/i.test(ua)) name = 'Samsung Internet';
  else if (/Chrome/i.test(ua)) name = 'Chrome';
  else if (/Firefox/i.test(ua)) name = 'Firefox';
  else if (/Safari/i.test(ua)) name = 'Safari';

  let inApp: string | null = null;
  if (/BytedanceWebview|tiktok|Musical_ly/i.test(ua)) inApp = 'تيك توك';
  else if (/Instagram/i.test(ua)) inApp = 'إنستغرام';
  else if (/Snapchat/i.test(ua)) inApp = 'سناب شات';
  else if (/Telegram/i.test(ua)) inApp = 'تيليجرام';
  else if (/FBAN|FBAV|Facebook/i.test(ua)) inApp = 'فيسبوك';
  else if (/Twitter|XClient/i.test(ua)) inApp = 'تويتر/X';

  return {
    name,
    inApp,
    userAgent: ua,
    platform: navigator.platform || 'unknown',
  };
}

export function deviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: (navigator as { platform?: string }).platform ?? null,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    maxTouchPoints: navigator.maxTouchPoints ?? null,
    screen: {
      width: screen.width,
      height: screen.height,
      pixelRatio: window.devicePixelRatio,
    },
    isHttps: location.protocol === 'https:',
    isStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
  };
}
