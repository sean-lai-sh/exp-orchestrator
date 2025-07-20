import type {
    CompatibilityLevel,
    SerializableTypeCompatRule,
    TypeValidator,
} from './types';

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
                return rule.result;
            }
        }

        // Global rule: anything → bytes = 'ok'
        if (to === 'bytes') {
            return 'ok';
        }

        // Global rule: bytes → anything else = 'warn'
        if (from === 'bytes' && to !== 'bytes') {
            return 'warn';
        }

        // Fallback
        const fallback = allRules.find((r) => 'default' in r && r.default);
        return fallback ? fallback.result : 'error';
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




export { validate };
