"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSignedInUser } from "@/components/auth/AuthProvider";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/Button";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { FieldError, Label, TextInput } from "@/components/ui/Field";
import { ArrowLeftIcon, LockIcon } from "@/components/ui/icons";
import { getFirebase } from "@/lib/firebase/client";
import { createRoom } from "@/lib/firebase/rooms";
import { DEFAULT_SETTINGS, LIMITS, hasErrors, validateRoomSettings } from "@/lib/room/settings";
import { RoomSettingsFields, formFromSettings, settingsFromForm, type RoomForm } from "./RoomSettingsFields";

export function CreateRoomScreen() {
  const user = useSignedInUser();
  const router = useRouter();
  const [form, setForm] = useState<RoomForm>(() => formFromSettings("", DEFAULT_SETTINGS));
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settings = settingsFromForm(form);
  const errors = submitted ? validateRoomSettings(form.name, settings) : {};
  const passwordError = submitted && usePassword && !password ? "Enter a password or turn it off." : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors(validateRoomSettings(form.name, settings)) || (usePassword && !password)) return;
    setCreating(true);
    setError(null);
    try {
      const { roomId } = await createRoom(getFirebase().db, user, {
        name: form.name,
        settings,
        password: usePassword ? password : "",
      });
      router.replace(`/room/${roomId}?invite=1`);
    } catch (err) {
      console.error(err);
      setError("Couldn't create the room. Check your connection and try again.");
      setCreating(false);
    }
  }

  return (
    <>
      <AppHeader />
      <form onSubmit={onSubmit} noValidate className="mx-auto flex w-full max-w-lg flex-col px-4 pb-32 pt-4">
        <Link href="/" className="mb-3 inline-flex items-center gap-1.5 self-start text-sm text-ivory-muted hover:text-ivory">
          <ArrowLeftIcon size={16} /> Home
        </Link>
        <h1 className="text-gold mb-6 text-3xl font-bold">New room</h1>

        <RoomSettingsFields form={form} onChange={setForm} errors={errors} />

        <div className="mt-6">
          <Label>Privacy</Label>
          <p className="mb-3 text-xs text-ivory-muted">
            Rooms are private already: people need the code or link to join. A password adds one more step.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={usePassword}
            onClick={() => setUsePassword((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border gold-hairline bg-felt-950/40 px-4 py-3"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <LockIcon size={16} className="text-gold-400" /> Require a password
            </span>
            <span
              className={`relative h-6 w-11 rounded-full transition ${usePassword ? "bg-gold-500" : "bg-ivory/15"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-ivory shadow transition-all ${
                  usePassword ? "left-5.5" : "left-0.5"
                }`}
              />
            </span>
          </button>
          {usePassword && (
            <div className="mt-2">
              <TextInput
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Table password"
                maxLength={LIMITS.passwordMax}
                autoComplete="off"
                aria-label="Room password"
              />
              <FieldError>{passwordError}</FieldError>
            </div>
          )}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t gold-hairline bg-felt-950/85 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <ErrorNotice message={error} onDismiss={() => setError(null)} />
            <Button type="submit" size="lg" className="w-full" disabled={creating}>
              {creating ? "Setting the table…" : "Create room"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
