import fs from 'node:fs';
import path from 'node:path';

/**
 * Приветственное изображение главного меню (`sendPhoto`).
 * Исходник: каталог `assets/` в корне репозитория (при сборке копируется в `dist/assets/`).
 */
export const MAIN_MENU_PHOTO_FILENAME = 'start_hud.jpg';

export function resolveMainMenuPhotoPath(): string {
  const cwd = process.cwd();
  const underAssets = path.join(cwd, 'assets', MAIN_MENU_PHOTO_FILENAME);
  const underDistAssets = path.join(
    cwd,
    'dist',
    'assets',
    MAIN_MENU_PHOTO_FILENAME,
  );
  const underDistRoot = path.join(cwd, 'dist', MAIN_MENU_PHOTO_FILENAME);

  if (fs.existsSync(underAssets)) {
    return underAssets;
  }
  if (fs.existsSync(underDistAssets)) {
    return underDistAssets;
  }
  if (fs.existsSync(underDistRoot)) {
    return underDistRoot;
  }

  return underAssets;
}
