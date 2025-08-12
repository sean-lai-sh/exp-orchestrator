import type {
    CompatibilityLevel,
    SerializableTypeCompatRule,
    TypeValidator,
} from './types';
import { toast } from 'sonner';
import defaultRulesRaw from './CompatRules/DefaultCompatibilityRules.json';

const defaultRules = defaultRulesRaw as SerializableTypeCompatRule[];
let userRules: SerializableTypeCompatRule[] = [];

const protectedPairs = new Set<string>(
    defaultRules
    .filter((r): r is { from: string; to: string; result: CompatibilityLevel } => 'from' in r && 'to' in r)
    .map((r) => `${r.from}->${r.to}`)
);

function buildValidator(
    defaults: SerializableTypeCompatRule[],
    users: SerializableTypeCompatRule[]
): TypeValidator {
    const allRules = [...users, ...defaults];

    return (from: string, to: string): CompatibilityLevel => {
        for (const rule of allRules) {
            if ('from' in rule && 'to' in rule && rule.from === from && rule.to === to) {
                showToast(rule.result, from, to);
                return rule.result;
            }
        }

        // Global rule: anything → bytes = 'ok'
        if (to === 'bytes') {
            showToast('warn', from, to);
            return 'warn';
        }

        // Global rule: bytes → anything else = 'warn'
        if (from === 'bytes' && to !== 'bytes') {
            showToast('warn', from, to);
            return 'warn';
        }

        // Fallback
        const fallback = allRules.find((r) => 'default' in r && r.default);
        const result = fallback ? fallback.result : 'error'
        showToast(result, from, to);
        return result;
    };
}
  
/// Validation; tells us that generation that we cannot coerce certain types and behaviors
function isUnsafeOkRule(rule: SerializableTypeCompatRule): boolean {
    if (!('from' in rule && 'to' in rule && rule.result === 'ok')) return false;
  
    // Allowable OK coercions:
    if (rule.to === 'bytes') return true;
    if (rule.from === 'bytes' && rule.to === 'bytes') return true;
  
    // All other user-defined 'ok' coercions are unsafe by default
    return true;
}
  

export function addUserRule(rule: SerializableTypeCompatRule): void {
    if ('from' in rule && 'to' in rule) {
        const key = `${rule.from}->${rule.to}`;

        if (protectedPairs.has(key)) {
        throw new Error(`Cannot overwrite protected default rule: ${key}`);
        }

        if (isUnsafeOkRule(rule)) {
        throw new Error(`Unsafe coercion "${key}" cannot be marked 'ok'. Use 'warn' or 'error'.`);
        }
    }

    userRules = [...userRules, rule];
    validate = buildValidator(defaultRules, userRules);
}

export function resetUserRules(): void {
    userRules = [];
    validate = buildValidator(defaultRules, userRules);
}

let validate: TypeValidator = buildValidator(defaultRules, userRules);


function showToast(result: CompatibilityLevel, from: string, to: string) {
    if (result === 'ok') {
      toast.success(`Types are compatible: ${from} → ${to}`);
    } else if (result === 'warn') {
      toast(`⚠️ Warning: Risky coercion ${from} → ${to}`, {
        description: `Double-check this transfer and ensure it fufills your needs. It may not handle ALL edge cases! ${to === 'bytes' ? ' Always be wary how you handle bytes!' : ''}`,
      });
    } else {
      toast.error(`Error: Incompatible types ${from} → ${to}`);
    }
  }
  

export { validate };
