/** Redis: переопределение списка рабочих inbound после auto-failover (legacy multi-working). */
export const REDIS_WORKING_INBOUND_IDS_KEY = 'balalaika:vpn:working_inbound_ids';

/** Redis: индекс текущей рабочей ноды в упорядоченном NODE_IPS (0-based). */
export const REDIS_QUEUE_WORKING_INDEX_KEY = 'balalaika:vpn:queue:working_index';
