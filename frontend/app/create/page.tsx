'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import MinimalCanvas from "@/components/canvas/MinimalCanvas";

function CreateContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project');
  return <MinimalCanvas projectId={projectId} />;
}

export default function CreatePage() {
  return (
    <Suspense>
      <CreateContent />
    </Suspense>
  );
}
