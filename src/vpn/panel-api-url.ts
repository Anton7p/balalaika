/**
 * URL для 3x-ui v3 при webBasePath `/panel/`:
 * REST — `{origin}/panel/panel/api/…`, UI auth — `{origin}/panel/csrf-token`.
 */
export function joinPanelApiUrl(
  panelOrigin: string,
  suffix: string,
  webBasePath = '/panel',
): string {
  const origin = panelOrigin.replace(/\/+$/, '');
  const base = (webBasePath.startsWith('/') ? webBasePath : `/${webBasePath}`).replace(
    /\/+$/,
    '',
  );
  const path = suffix.startsWith('/') ? suffix : `/${suffix}`;

  if (path.startsWith(`${base}/panel/api`)) {
    return `${origin}${path}`;
  }

  if (path.startsWith('/panel/api')) {
    return `${origin}${base}${path}`;
  }

  if (path.startsWith('/panel/')) {
    const rest = path.slice('/panel'.length) || '/';
    return `${origin}${base}${rest}`;
  }

  return `${origin}${base}${path}`;
}
