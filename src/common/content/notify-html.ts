import { escapeHtml } from './html-escape';
import { UI_LABELS } from './ui-labels';

/** Уведомления под parse_mode: HTML (см. отправку в BotService). */
export const NOTIFY_HTML = {
  SUBSCRIPTION_SUCCESS: (subscriptionUrl: string) => {
    const safe = escapeHtml(subscriptionUrl);
    return (
      `✅ <b>Подписка успешно активирована!</b>\n\n` +
      `Ваш ключ доступа:\n` +
      `<code>${safe}</code>\n\n` +
      `Нажмите на ключ, чтобы скопировать его.`
    );
  },

  SUBSCRIPTION_EXPIRING_SOON: (until: string) =>
    `⏳ <b>Подписка скоро закончится</b>\n\n` +
    `Действует до: <b>${escapeHtml(until)}</b>\n\n` +
    `Продлите доступ в боте через «${UI_LABELS.QUICK_START}», чтобы не потерять VPN.`,

  SUBSCRIPTION_ENDED: () =>
    `🔒 <b>Подписка закончилась</b>\n\n` +
    `Срок доступа по ключу истёк. Чтобы снова пользоваться VPN, оформите доступ через «${UI_LABELS.QUICK_START}».`,

  SUBSCRIPTION_FAILED: (errorMessage: string) =>
    `❌ <b>Ошибка активации подписки</b>\n\n` +
    `К сожалению, не удалось создать подписку.\n` +
    `Ошибка: ${escapeHtml(errorMessage)}\n\n` +
    `Пожалуйста, обратитесь в поддержку.`,
} as const;
