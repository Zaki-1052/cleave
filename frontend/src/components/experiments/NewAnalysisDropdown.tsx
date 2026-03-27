// frontend/src/components/experiments/NewAnalysisDropdown.tsx
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface NewAnalysisDropdownProps {
  onAlignmentClick: () => void;
}

export function NewAnalysisDropdown({ onAlignmentClick }: NewAnalysisDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <Button onClick={() => setIsOpen(!isOpen)}>
        New Analysis ▼
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onAlignmentClick();
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-primary/10"
          >
            Alignment
          </button>
          <button
            type="button"
            disabled
            className="w-full px-4 py-2 text-left text-sm text-gray-400 cursor-not-allowed"
            title="Coming in Phase 4"
          >
            Peak Calling
          </button>
        </div>
      )}
    </div>
  );
}
