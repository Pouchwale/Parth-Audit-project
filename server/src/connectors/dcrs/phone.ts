import type { PhoneRelay, RelayOptions } from '../types.ts';
import { tokenOf, type DcrsClient } from './client.ts';
import { segment } from './inputs.ts';

/**
 * The phone's inbox, tasks and Review screen, relayed to DCRS's /api/v1 as the signed-in person (DCRS's
 * docs/chatbot-integration.md, "Notification contract changes"). DCRS keeps the notification ledger, sends the push
 * alerts, works out the tasks and checks every value and every level of access; this only carries the person's own
 * DCRS sign-in there and back, with the header X-Client-Name: Mitra mobile app, so a change shows in the record's
 * history as "Through Mitra mobile app". A refusal comes back as a ConnectorError in DCRS's words (client.ts refusalOf),
 * in the language the person reads the app in (X-Language, when the app says it).
 */
export function phoneRelay(dcrs: DcrsClient): PhoneRelay {
  const as = (credentials: unknown, options?: RelayOptions) => ({ token: tokenOf(credentials), ...(options?.language ? { language: options.language } : {}) });
  return {
    notifications: (credentials, query, options) => dcrs.json('GET', '/api/v1/notifications', { ...as(credentials, options), query }),
    markRead: (credentials, body, options) => dcrs.json('POST', '/api/v1/notifications/read', { ...as(credentials, options), body }),
    testNotification: (credentials, options) => dcrs.json('POST', '/api/v1/notifications/test', { ...as(credentials, options), body: {} }),
    preferences: (credentials, options) => dcrs.json('GET', '/api/v1/notification-preferences', as(credentials, options)),
    savePreferences: (credentials, body, options) => dcrs.json('PUT', '/api/v1/notification-preferences', { ...as(credentials, options), body }),
    registerDevice: (credentials, body, options) => dcrs.json('POST', '/api/v1/devices', { ...as(credentials, options), body }),
    removeDevice: (credentials, body, options) => dcrs.json('DELETE', '/api/v1/devices', { ...as(credentials, options), body }),
    tasks: (credentials, options) => dcrs.json('GET', '/api/v1/today', as(credentials, options)),
    startRecord: (credentials, body, options) => dcrs.json('POST', '/api/v1/records', { ...as(credentials, options), body }),
    record: (credentials, recordId, options) => dcrs.json('GET', `/api/v1/records/${segment(recordId)}`, as(credentials, options)),
    changeRecord: (credentials, recordId, body, options) =>
      dcrs.json('POST', `/api/v1/records/${segment(recordId)}/changes`, { ...as(credentials, options), body }),
    actOnRecord: (credentials, recordId, body, options) =>
      dcrs.json('POST', `/api/v1/records/${segment(recordId)}/actions`, { ...as(credentials, options), body }),
  };
}
