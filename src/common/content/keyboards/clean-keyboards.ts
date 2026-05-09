import { Markup } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import { ACTIONS } from '../actions';
import { ACCESS_PRICES } from '../access-prices';
import type { LegalLink, LegalLinkKey } from '../legal-links';
import type { PlatformGuidesBundle } from '../platform-guides';
import { UI_LABELS } from '../ui-labels';

type InlineKbBtn = InlineKeyboardButton & { hide?: boolean };
type InlineKbRow = InlineKbBtn[];
type InlineKbGrid = InlineKbRow[];

function formatFreeTrialButtonLabel(option: {
  readonly label: string;
  readonly devices: number;
  readonly price: number;
}): string {
  return `[🎁] ${option.label} ✦ ${option.devices} 📱 ✦ ${option.price}₽`;
}

function formatPaidPlanLabel(option: {
  readonly label: string;
  readonly devices: number;
  readonly price: number;
}): string {
  return `${option.label} ✦ ${option.devices} 📱 ✦ ${option.price}₽`;
}

export function mainKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  const rows: InlineKbGrid = [
    [Markup.button.callback(UI_LABELS.QUICK_START, ACTIONS.BUY_MENU)],
    [
      Markup.button.callback(UI_LABELS.MY_KEYS, ACTIONS.MY_KEYS),
      Markup.button.callback(UI_LABELS.HOW_TO_CONNECT, ACTIONS.INSTRUCTIONS),
    ],
    [Markup.button.callback(UI_LABELS.LEGAL, ACTIONS.LEGAL)],
  ];
  return Markup.inlineKeyboard(rows);
}

export function durationKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  const rows: InlineKbGrid = [];

  const freeTest = ACCESS_PRICES.find((p) => p.months === 0);
  if (freeTest && freeTest.devices !== undefined) {
    rows.push([
      Markup.button.callback(
        formatFreeTrialButtonLabel({
          label: freeTest.label,
          devices: freeTest.devices,
          price: freeTest.price,
        }),
        ACTIONS.FREE_TEST,
      ),
    ]);
  }

  const month1 = ACCESS_PRICES.find((p) => p.months === 1);
  if (month1) {
    rows.push([
      Markup.button.callback(formatPaidPlanLabel(month1), ACTIONS.MONTH_1),
    ]);
  }

  const month3 = ACCESS_PRICES.find((p) => p.months === 3);
  if (month3) {
    rows.push([
      Markup.button.callback(formatPaidPlanLabel(month3), ACTIONS.MONTH_3),
    ]);
  }

  rows.push([
    Markup.button.callback(UI_LABELS.BACK_TO_MENU, ACTIONS.START_MENU),
  ]);

  return Markup.inlineKeyboard(rows);
}

export function emptyKeysKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  return mainKeyboard();
}

export function platformKeyboard(
  guides: PlatformGuidesBundle,
): ReturnType<typeof Markup.inlineKeyboard> {
  const rows: InlineKbGrid = [
    [
      Markup.button.url(UI_LABELS.PLATFORM_ANDROID, guides.ANDROID),
      Markup.button.url(UI_LABELS.PLATFORM_WINDOWS, guides.WINDOWS),
    ],
    [
      Markup.button.url(UI_LABELS.PLATFORM_IOS, guides.IOS),
      Markup.button.url(UI_LABELS.PLATFORM_MACOS, guides.MACOS),
    ],
    [Markup.button.callback(UI_LABELS.BACK_TO_MENU, ACTIONS.START_MENU)],
  ];
  return Markup.inlineKeyboard(rows);
}

export function legalKeyboard(
  links: Record<LegalLinkKey, LegalLink>,
): ReturnType<typeof Markup.inlineKeyboard> {
  const rows: InlineKbGrid = [
    [Markup.button.url(links.FAQ.name, links.FAQ.url)],
    [Markup.button.url(links.TERMS.name, links.TERMS.url)],
    [Markup.button.url(links.PRIVACY.name, links.PRIVACY.url)],
    [Markup.button.callback(UI_LABELS.BACK_TO_MENU, ACTIONS.START_MENU)],
  ];
  return Markup.inlineKeyboard(rows);
}

export function keyDisplayKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [Markup.button.callback(UI_LABELS.COPY_KEY, ACTIONS.COPY_KEY)],
    [Markup.button.callback(UI_LABELS.BACK_TO_MENU, ACTIONS.START_MENU)],
  ]);
}

export function extendSuccessKeyboard(): ReturnType<
  typeof Markup.inlineKeyboard
> {
  return Markup.inlineKeyboard([
    [Markup.button.callback(UI_LABELS.BACK_TO_MENU, ACTIONS.START_MENU)],
  ]);
}

export function platformDetailKeyboard(
  guideUrl?: string,
): ReturnType<typeof Markup.inlineKeyboard> {
  const rows: InlineKbGrid = [];

  if (guideUrl !== undefined && guideUrl.length > 0) {
    rows.push([Markup.button.url(UI_LABELS.OPEN_GUIDE, guideUrl)]);
  }

  rows.push([
    Markup.button.callback(UI_LABELS.BACK_TO_MENU, ACTIONS.START_MENU),
  ]);

  return Markup.inlineKeyboard(rows);
}
