"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useApp, useSupabase } from "@/lib/app-context";
import { addBirthdayEvents, api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { daysUntil, initials } from "@/lib/format";
import type { Contact } from "@/lib/types";

export default function PeoplePage() {
  const { t } = useApp();
  const supabase = useSupabase();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    setContacts(await api.contacts(supabase));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    await supabase.from("contacts").delete().eq("id", id);
    // remove the recurring all-day birthday events created for this contact
    await supabase.from("calendar_events").delete().eq("description", `🎂:${id}`);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.people.title}
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t.people.add}
          </Button>
        }
      />

      {contacts.length === 0 ? (
        <Card>
          <EmptyState icon="👥" title={t.people.noContacts} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => {
            const last = c.last_contacted ? daysUntil(c.last_contacted) * -1 : null;
            const birthdaySoon =
              c.birthday && daysUntil(c.birthday) >= 0 && daysUntil(c.birthday) <= 14;
            return (
              <Card key={c.id} className="group flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{c.name}</p>
                      <p className="text-[11px] text-zinc-500">{c.relationship ?? ""}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-60 transition hover:opacity-100">
                      <button
                        onClick={() => { setEditing(c); setOpen(true); }}
                        className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/8 hover:text-zinc-100"
                        title={t.common.edit}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/8 hover:text-red-400"
                        title={t.common.delete}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.birthday && birthdaySoon && (
                      <Badge color="pink">
                        🎂 {new Date(c.birthday).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}
                      </Badge>
                    )}
                    {last !== null && (
                      <Badge color={last > 14 ? "red" : "zinc"}>
                        {t.people.notContacted} {c.name.split(" ")[0]} {t.people.days} {last}
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ContactModal
        open={open}
        contact={editing}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSaved={load}
      />
    </div>
  );
}

function ContactModal({
  open,
  contact,
  onClose,
  onSaved,
}: {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useApp();
  const supabase = useSupabase();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [lastContacted, setLastContacted] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(contact?.name ?? "");
      setRelationship(contact?.relationship ?? "");
      setPhone(contact?.phone ?? "");
      setEmail(contact?.email ?? "");
      setBirthday(contact?.birthday ?? "");
      setLastContacted(contact?.last_contacted ?? "");
      setNotes(contact?.notes ?? "");
    }
  }, [open, contact]);

  async function save() {
    if (!name.trim()) return;
    const trimmed = name.trim();
    const payload = {
      name: trimmed,
      relationship: relationship || null,
      phone: phone || null,
      email: email || null,
      birthday: birthday || null,
      last_contacted: lastContacted || null,
      notes: notes || null,
    };
    let id = contact?.id;
    if (contact) {
      await supabase.from("contacts").update(payload).eq("id", contact.id);
    } else {
      const { data } = await supabase.from("contacts").insert(payload).select("id").single();
      id = data?.id;
    }
    // keep the all-day birthday calendar events in sync (create/edit/remove)
    if (id) {
      await supabase.from("calendar_events").delete().eq("description", `🎂:${id}`);
      if (birthday) {
        await addBirthdayEvents(supabase, `🎂 ${t.people.birthday} — ${trimmed}`, id, birthday);
      }
    }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={contact ? t.common.edit : t.people.add}>
      <div className="space-y-4">
        <Field label={t.common.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.people.relationship}>
            <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Amigo, família…" />
          </Field>
          <Field label={t.people.birthday}>
            <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t.people.lastContacted}>
            <Input type="date" value={lastContacted} onChange={(e) => setLastContacted(e.target.value)} />
          </Field>
        </div>
        <Field label={t.common.notes}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <Button className="w-full" onClick={save} disabled={!name.trim()}>
          {t.common.save}
        </Button>
      </div>
    </Modal>
  );
}
