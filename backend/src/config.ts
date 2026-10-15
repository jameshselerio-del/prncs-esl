import { ApiError } from './errors';

export type ConfigKey =
  | 'SPREADSHEET_ID'
  | 'GOOGLE_CLIENT_ID'
  | 'APP_URL'
  | 'SCHEMA_VERSION'
  /** "staging" on the staging script; unset in production. */
  | 'ENVIRONMENT'
  /** Staging only: the Google account seedDemoData makes the teacher. */
  | 'ADMIN_EMAIL'
  /** "1" once the hourly reminder trigger has been installed. */
  | 'TRIGGERS_VERSION';

/** The published site (GitHub Pages); used in emails unless APP_URL overrides it. */
export const PRODUCTION_APP_URL = 'https://jameshselerio-del.github.io/prncs-esl/';

/** Link to the app for emails: APP_URL if set; otherwise the production site, or none on staging. */
export function appUrl(): string {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('APP_URL') || (props.getProperty('ENVIRONMENT') ? '' : PRODUCTION_APP_URL);
}

/** Values live in Apps Script → Project Settings → Script properties. */
export function getConfig(key: ConfigKey): string {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new ApiError(`Server is not configured: missing ${key}.`);
  return value;
}

export function setConfig(key: ConfigKey, value: string): void {
  PropertiesService.getScriptProperties().setProperty(key, value);
}
