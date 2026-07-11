// frontend/src/components/projects/CreateProjectModal.tsx
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
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
        <Field label="Description">
          <textarea
            className="rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional project description"
          />
        </Field>
        {createProject.isError && (
          <p className="text-sm text-destructive">Failed to create project. Please try again.</p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={handleClose}>
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
