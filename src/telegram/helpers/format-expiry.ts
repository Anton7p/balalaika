import dayjs from 'dayjs';
import 'dayjs/locale/ru';

dayjs.locale('ru');

export function formatRuDateTime(value: Date): string {
  return dayjs(value).format('DD.MM.YYYY HH:mm');
}
