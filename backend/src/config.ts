import { ApiError } from './errors';

export type ConfigKey = 'SPREADSHEET_ID' | 'GOOGLE_CLIENT_ID' | 'APP_URL' | 'SCHEMA_VERSION';

/** Values live in Apps Script → Project Settings → Script properties. */
export function getConfig(key: ConfigKey): string {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new ApiError(`Server is not configured: missing ${key}.`);
  return value;
}

export function setConfig(key: ConfigKey, value: string): void {
  PropertiesService.getScriptProperties().setProperty(key, value);
}
