// frontend/src/pages/SettingsPage.tsx
import { type FormEvent, useEffect, useState } from 'react';
import { Card } from '@/components/layout/Card';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { toast } from 'sonner';
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
      toast.success('Settings saved');
    } catch {
      setError('Failed to save settings. Please try again.');
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }

  if (!user) return null;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" eyebrow="Account" className="mb-0" />

      {/* Account Information */}
      <Card>
        <h3 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
      </Card>

      {/* Email Preferences */}
      <Card>
        <h3 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Email Preferences
        </h3>
        <div className="flex flex-col gap-4">
          <Input label="Account Email" value={user.email} disabled />
          <Field
            label="Job Email Notification"
            help="Get an email notification when a job finishes running."
          >
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
          </Field>
        </div>
      </Card>

      {/* Feedback messages */}
      {saveSuccess && (
        <p className="text-sm text-success">Settings saved successfully.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
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
  );
}
