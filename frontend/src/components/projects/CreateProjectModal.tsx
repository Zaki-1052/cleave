// frontend/src/components/projects/CreateProjectModal.tsx
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useCreateProject } from '@/hooks/useProjects';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProjectModal({ isOpen, onClose }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createProject = useCreateProject();

  function handleClose() {
    setName('');
    setDescription('');
    createProject.reset();
    onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createProject.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Project created');
          handleClose();
        },
      },
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Project">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Project Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter project name"
        />
        <div className="flex flex-col gap-1">
          <label className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Description
          </label>
          <textarea
            className="rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional project description"
          />
        </div>
        {createProject.isError && (
          <p className="text-sm text-red-500">Failed to create project. Please try again.</p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outlined" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || createProject.isPending}>
            {createProject.isPending ? 'Creating...' : 'Create Project'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
