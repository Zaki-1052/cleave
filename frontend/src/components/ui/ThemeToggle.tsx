// frontend/src/components/ui/ThemeToggle.tsx
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-4.5 w-4.5" />
      ) : (
        <Moon className="h-4.5 w-4.5" />
      )}
    </button>
  );
}
