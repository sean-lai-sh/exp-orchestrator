'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface SecureTokenDisplayProps {
  token: string | undefined;
  label?: string;
}

// const IconEye = () => <Eye className="h-4 w-4" />;
// const IconEyeOff = () => <EyeOff className="h-4 w-4" />;
const IconClipboard = () => <Copy className="h-4 w-4" />;
const IconCheck = () => <Check className="h-4 w-4 text-green-500" />;

export default function SecureTokenDisplay({ token, label }: SecureTokenDisplayProps) {
  const [isTokenRevealed, setIsTokenRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentToken = token || '';

  const handleCopyToken = () => {
    if (currentToken && !copied) {
      setCopied(true);
      navigator.clipboard.writeText(currentToken).then(() => {
        toast.success("Token copied to clipboard!");
        setTimeout(() => setCopied(false), 500);
      }).catch(err => {
        console.error('Failed to copy token: ', err);
        toast.error('Failed to copy token');
        setCopied(false); // Reset copied state on error
      });
    }
  };

  return (
    <div>
      {label && <div className="font-semibold mb-1 mt-2" style={{ color: 'hsl(220 10% 70%)' }}>{label}</div>}
      <div
        className="flex justify-between items-center gap-2 p-1 pl-2 rounded-lg"
        style={{ background: 'hsl(240 8% 9%)', border: '1px solid hsl(240 6% 18%)' }}
      >
        <span
          className="w-full text-sm font-mono whitespace-nowrap tracking-tighter"
          style={{ maxWidth: 'calc(100% - 70px)', color: 'hsl(220 10% 55%)' }}
        >
          {isTokenRevealed ? currentToken : formatAsterisks(currentToken?.length || 8)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopyToken}
          title="Copy token"
          className="h-7 w-7 flex-shrink-0"
          disabled={copied}
        >
          {copied ? <IconCheck /> : <IconClipboard />}
        </Button>
      </div>
    </div>
  );
} 

function formatAsterisks(len: number): string {
    const MAX_LENGTH = 36;
    const rawLen = Math.min(len, MAX_LENGTH);
    const raw = '∗'.repeat(rawLen);
  
    // Format into UUID-like groups: 8-4-4-4-12
    const parts = [];
    const groupSizes = [8, 4, 4, 4, 12];
    let cursor = 0;
  
    for (const size of groupSizes) {
      if (cursor >= raw.length) break;
      parts.push(raw.slice(cursor, cursor + size));
      cursor += size;
    }
  
    return parts.join('-');
  }