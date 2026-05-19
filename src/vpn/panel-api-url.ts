/** Собирает URL UI/API 3x-ui без дублирования webBasePath (типично `/panel`). */
export function joinPanelApiUrl(
  panelOrigin: string,
  suffix: string,
  webBasePath = '/panel',
): string {
  const origin = panelOrigin.replace(/\/+$/, '');
  const base = webBasePath.startsWith('/') ? webBasePath : `/${webBasePath}`;
  const baseNoTrail = base.replace(/\/+$/, '');
  let path = suffix.startsWith('/') ? suffix : `/${suffix}`;
  if (path.startsWith(`${baseNoTrail}/`)) {
    path = path.slice(baseNoTrail.length) || '/';
  }
  return `${origin}${baseNoTrail}${path}`;
}
