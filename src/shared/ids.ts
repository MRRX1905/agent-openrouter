export const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;
export const nowIso = (): string => new Date().toISOString();
