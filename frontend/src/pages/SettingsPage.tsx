// frontend/src/pages/SettingsPage.tsx
import { type FormEvent, useEffect, useState } from 'react';
import { Card } from '@/components/layout/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import * as authApi from '@/api/auth';
import { EMAIL_NOTIFICATION_OPTIONS } from '@/lib/constants';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [emailNotifications, setEmailNotifications] = useState('always');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setEmailNotifications(user.emailNotifications);
    }
  }, [user]);

  const hasChanges =
    !!user &&
    (firstName !== (user.firstName ?? '') ||
      lastName !== (user.lastName ?? '') ||
      emailNotifications !== user.emailNotifications);

  function handleCancel() {
    if (user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setEmailNotifications(user.emailNotifications);
    }
    setSaveSuccess(false);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setError('');
    try {
      await authApi.updateMe({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        emailNotifications,
      });
      await refreshUser();
      setSaveSuccess(true);
    } catch {
      setError('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!user) return null;

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <h2 className="mb-6 font-display text-lg font-semibold text-primary">Account Settings</h2>

        {/* Account Information */}
        <div className="mb-8">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Account Information
          </h3>
          <div className="flex flex-col gap-4">
            <Input label="User Name" value={user.email} disabled />
            <Input
              label="First Name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setSaveSuccess(false);
              }}
              placeholder="Enter first name"
            />
            <Input
              label="Last Name"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setSaveSuccess(false);
              }}
              placeholder="Enter last name"
            />
          </div>
        </div>

        <Separator />

        {/* Email */}
        <div className="mb-8">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Email
          </h3>
          <div className="flex flex-col gap-4">
            <Input label="Account Email" value={user.email} disabled />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Job Email Notification
              </label>
              <p className="mb-1 text-xs text-gray-400">
                Get an email notification when a job finishes running.
              </p>
              <Select
                value={emailNotifications}
                onValueChange={(value) => {
                  setEmailNotifications(value);
                  setSaveSuccess(false);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_NOTIFICATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Feedback messages */}
        {saveSuccess && (
          <p className="mb-4 text-sm text-status-complete">Settings saved successfully.</p>
        )}
        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outlined"
            onClick={handleCancel}
            disabled={!hasChanges && !saveSuccess}
          >
            Cancel
          </Button>
          <Button type="submit" loading={isSaving} disabled={!hasChanges}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}
