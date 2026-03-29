// frontend/src/components/projects/ManageMembersModal.tsx
import { type FormEvent, useState } from 'react';
import { UserMinus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  useMembers,
  useAddMember,
  useUpdateMemberRole,
  useRemoveMember,
} from '@/hooks/useProjects';
import { ROLE_LABELS } from '@/lib/constants';
import type { AxiosError } from 'axios';

interface ManageMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
}

const ROLES = Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>;

function getDisplayName(user: { firstName: string | null; lastName: string | null; email: string }): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  return user.email;
}

export function ManageMembersModal({ isOpen, onClose, projectId }: ManageMembersModalProps) {
  const { user: currentUser } = useAuth();
  const { data: members } = useMembers(projectId);
  const addMember = useAddMember();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('contributor');
  const [inviteError, setInviteError] = useState('');

  function handleClose() {
    setEmail('');
    setRole('contributor');
    setInviteError('');
    addMember.reset();
    onClose();
  }

  function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError('');
    addMember.mutate(
      { projectId, email: email.trim(), role },
      {
        onSuccess: () => {
          setEmail('');
          setRole('contributor');
        },
        onError: (err) => {
          const axiosErr = err as AxiosError<{ detail: string }>;
          const detail = axiosErr.response?.data?.detail;
          if (axiosErr.response?.status === 404) {
            setInviteError('No user found with that email address.');
          } else if (axiosErr.response?.status === 409) {
            setInviteError(detail ?? 'User is already a member.');
          } else {
            setInviteError(detail ?? 'Failed to invite member.');
          }
        },
      },
    );
  }

  function handleRoleChange(userId: number, newRole: string) {
    updateRole.mutate({ projectId, userId, role: newRole });
  }

  function handleRemove(userId: number) {
    removeMember.mutate({ projectId, userId });
  }

  const adminCount = members?.filter((m) => m.role === 'admin').length ?? 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Manage Members">
      <form onSubmit={handleInvite} className="flex items-end gap-3">
        <div className="flex-1">
          <Input
            label="Add Member"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="User email address"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="invite-role" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Access
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={!email.trim() || addMember.isPending}>
          {addMember.isPending ? 'Inviting...' : 'Invite'}
        </Button>
      </form>
      {inviteError && <p className="mt-2 text-sm text-red-500">{inviteError}</p>}

      <hr className="my-5" />

      <h3 className="mb-3 text-sm font-semibold text-primary">Members</h3>
      <div className="space-y-3">
        {members?.map((member) => {
          const isSelf = member.userId === currentUser?.id;
          const isLastAdmin = member.role === 'admin' && adminCount <= 1;

          return (
            <div key={member.userId} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">
                {getDisplayName(member.user)}
              </span>
              <div className="flex items-center gap-2">
                <select
                  aria-label={`Role for ${getDisplayName(member.user)}`}
                  value={member.role}
                  disabled={isSelf}
                  onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                  className={`rounded-md border px-2 py-1 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
                    isSelf
                      ? 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                      : 'border-gray-300'
                  }`}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                {!isSelf && (
                  <button
                    type="button"
                    onClick={() => handleRemove(member.userId)}
                    disabled={isLastAdmin || removeMember.isPending}
                    title={isLastAdmin ? 'Cannot remove the last admin' : 'Remove member'}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-center">
        <Button variant="outlined" type="button" onClick={handleClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
