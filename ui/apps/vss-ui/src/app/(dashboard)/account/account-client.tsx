"use client";

import { useState, type FormEvent } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export interface ProfileValues {
  username: string;
  email: string | null;
  fullName: string | null;
  companyName: string | null;
  website: string | null;
}

/**
 * Profile + password forms. Both post to the account API routes and rely on the
 * httpOnly session cookie, so no token juggling is needed here.
 */
export function AccountClient({ profile }: Readonly<{ profile: ProfileValues }>) {
  return (
    <div className="space-y-6">
      <ProfileCard profile={profile} />
      <PasswordCard />
    </div>
  );
}

function ProfileCard({ profile }: Readonly<{ profile: ProfileValues }>) {
  const { toast } = useToast();
  const [values, setValues] = useState<{
    full_name: string;
    email: string;
    company_name: string;
    website: string;
  }>({
    full_name: profile.fullName ?? "",
    email: profile.email ?? "",
    company_name: profile.companyName ?? "",
    website: profile.website ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Could not save the profile.");
      toast({ title: "Profile saved", description: "Your details have been updated." });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Shown on invoices and used when we need to reach you about the account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="full_name"
              label="Full name"
              value={values.full_name}
              onChange={(v) => setValues((s) => ({ ...s, full_name: v }))}
            />
            <Field
              id="company_name"
              label="Company"
              value={values.company_name}
              onChange={(v) => setValues((s) => ({ ...s, company_name: v }))}
            />
            <Field
              id="email"
              label="Email"
              type="email"
              value={values.email}
              onChange={(v) => setValues((s) => ({ ...s, email: v }))}
            />
            <Field
              id="website"
              label="Website"
              value={values.website}
              onChange={(v) => setValues((s) => ({ ...s, website: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-4 pt-2">
            <span className="timecode text-[11px] text-muted-foreground">
              signed in as {profile.username}
            </span>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


function PasswordCard() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Could not change the password.");
      setCurrent("");
      setNext("");
      toast({
        title: "Password changed",
        description: "Use the new password the next time you sign in.",
      });
    } catch (err) {
      toast({
        title: "Change failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>At least 4 characters, as enforced by the API.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="current_password" className="eyebrow">
                Current
              </Label>
              <Input
                id="current_password"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_password" className="eyebrow">
                New
              </Label>
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" variant="outline" disabled={saving}>
              {saving ? "Updating…" : "Change password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: Readonly<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="eyebrow">
        {label}
      </Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
