'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import MinimalCanvas from "@/components/canvas/MinimalCanvas";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function CreateContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project');
  return (
    <ErrorBoundary label="MinimalCanvas">
      <MinimalCanvas projectId={projectId} />
    </ErrorBoundary>
  );
}

export default function CreatePage() {
  return (
    <Suspense>
      <CreateContent />
    </Suspense>
  );
}
