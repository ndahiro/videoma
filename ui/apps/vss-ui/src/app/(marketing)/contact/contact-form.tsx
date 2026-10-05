"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/** Contact form — posts to /api/contact, which stores the request and emails the team. */
export function ContactForm() {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [values, setValues] = useState({
    first_name: "",
    last_name: "",
    email: "",
    company_name: "",
    message_body: "",
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Could not send the message.");
      setSent(true);
      setValues({ first_name: "", last_name: "", email: "", company_name: "", message_body: "" });
      toast({
        title: "Message sent",
        description: "Thanks — we will get back to you shortly.",
      });
    } catch (err) {
      toast({
        title: "Sending failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="border border-card-border bg-card p-7 space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="first_name"
          label="First name"
          value={values.first_name}
          onChange={(v) => setValues((s) => ({ ...s, first_name: v }))}
        />
        <Field
          id="last_name"
          label="Last name"
          value={values.last_name}
          onChange={(v) => setValues((s) => ({ ...s, last_name: v }))}
        />
        <Field
          id="email"
          label="Email"
          type="email"
          required
          value={values.email}
          onChange={(v) => setValues((s) => ({ ...s, email: v }))}
        />
        <Field
          id="company_name"
          label="Company"
          value={values.company_name}
          onChange={(v) => setValues((s) => ({ ...s, company_name: v }))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message_body" className="eyebrow">
          Message
        </Label>
        <textarea
          id="message_body"
          required
          rows={6}
          value={values.message_body}
          onChange={(e) => setValues((s) => ({ ...s, message_body: e.target.value }))}
          className="w-full border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Roughly how many hours of footage, and what are you trying to find in it?"
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="timecode text-[10px] text-muted-foreground">
          {sent ? "received — thank you" : "no newsletter, no spam"}
        </span>
        <Button type="submit" disabled={sending}>
          {sending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="eyebrow">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
