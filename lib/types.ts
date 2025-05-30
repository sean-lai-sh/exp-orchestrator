export type CompatibilityLevel = 'ok' | 'warn' | 'error';

export type SerializableTypeCompatRule =
  | { from: string; to: string; result: CompatibilityLevel }
  | { default: true; result: CompatibilityLevel };

export type TypeValidator = (from: string, to: string) => CompatibilityLevel;

