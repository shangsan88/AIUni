'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

const MonacoEditor = dynamic<ComponentProps<typeof import('@monaco-editor/react').default>>(
  () => import('@monaco-editor/react'),
  { ssr: false },
);

interface CodeEditorProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
}

export function CodeEditor({ value, language, onChange }: CodeEditorProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
      <MonacoEditor
        height="320px"
        language={language === 'cpp' ? 'cpp' : language}
        theme="vs-dark"
        value={value}
        onChange={(next: string | undefined) => onChange(next || '')}
        options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: 'on' }}
      />
    </div>
  );
}
