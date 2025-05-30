'use client';

import { useState } from 'react';
import { toast} from 'sonner';
import { validate } from '@/lib/edgeEvals';

export default function Page() {
  const [fromType, setFromType] = useState('bytes');
  const [toType, setToType] = useState('bytes');

  const handleCheck = () => {
    const result = validate(fromType, toType);

    if (result === 'ok') {
      toast.success(`Types are compatible: ${fromType} → ${toType}`);
    } else if (result === 'warn') {
      toast(`⚠️ Warning: Risky coercion ${fromType} → ${toType}`, {
        description: 'Double-check this transformation. Take extra care if you are proceeding.',
      });
    } else if (result === 'error') {
      toast.error(`❌ Error: Incompatible types ${fromType} → ${toType}`);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Type Compatibility Checker</h1>

      <div className="space-x-2">
        <label>
          From:
          <input
            type="text"
            value={fromType}
            onChange={(e) => setFromType(e.target.value)}
            className="border px-2 py-1 ml-1"
          />
        </label>
        <label>
          To:
          <input
            type="text"
            value={toType}
            onChange={(e) => setToType(e.target.value)}
            className="border px-2 py-1 ml-1"
          />
        </label>
      </div>

      <button
        onClick={handleCheck}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Check Eval
      </button>

    </div>
  );
}
