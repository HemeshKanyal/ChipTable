"use client";

import { useState } from "react";
import { RoomSettingsFields, formFromSettings, settingsFromForm, type RoomForm } from "@/components/rooms/RoomSettingsFields";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Label, TextInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { getFirebase } from "@/lib/firebase/client";
import { setRoomPassword, updateRoomSettings } from "@/lib/firebase/rooms";
import type { Room } from "@/lib/hooks/useRoom";
import { LIMITS, hasErrors, validateRoomSettings } from "@/lib/room/settings";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  room: Room;
}

export function SettingsSheet({ open, onClose, room }: SettingsSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Room settings">
      {/* Remount on open so the form starts from the latest saved settings. */}
      {open && <SettingsForm room={room} onDone={onClose} />}
    </BottomSheet>
  );
}

function SettingsForm({ room, onDone }: { room: Room; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<RoomForm>(() => formFromSettings(room.name, room.settings));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const highestSeat = Math.max(-1, ...Object.keys(room.seats).map(Number));
  const minPlayers = Math.max(LIMITS.minPlayers, highestSeat + 1);
  const settings = settingsFromForm(form);
  const errors = submitted ? validateRoomSettings(form.name, settings) : {};
  if (submitted && settings.maxPlayers < minPlayers) {
    errors.maxPlayers = `Seat ${highestSeat + 1} is taken, so keep at least ${minPlayers} seats.`;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors(validateRoomSettings(form.name, settings)) || settings.maxPlayers < minPlayers) return;
    setSaving(true);
    try {
      await updateRoomSettings(getFirebase().db, room.id, room.code, form.name, settings);
      toast("Settings saved", "success");
      onDone();
    } catch (err) {
      console.error(err);
      toast("Couldn't save settings", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onPassword(next: string) {
    setSavingPassword(true);
    try {
      await setRoomPassword(getFirebase().db, room.id, room.code, next);
      setPassword("");
      toast(next ? "Password set" : "Password removed", "success");
    } catch (err) {
      console.error(err);
      toast("Couldn't update the password", "error");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSave} noValidate className="flex flex-col gap-5">
        <RoomSettingsFields form={form} onChange={setForm} errors={errors} minPlayers={minPlayers} />
        <p className="text-xs text-ivory-muted">
          A new starting stack applies to players joining for the first time. Existing stacks don&apos;t change.
        </p>
        {room.currentHandId && (
          <p className="rounded-xl border gold-hairline bg-felt-950/50 px-3 py-2 text-xs text-gold-200">
            A hand is in progress. Settings can change once it&apos;s over.
          </p>
        )}
        <Button type="submit" size="lg" disabled={saving || !!room.currentHandId}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>

      <div className="border-t gold-hairline pt-5">
        <Label htmlFor="room-password">{room.hasPassword ? "Change password" : "Add a password"}</Label>
        <p className="mb-2 text-xs text-ivory-muted">
          {room.hasPassword
            ? "New players need the password. People already in the room aren't affected."
            : "Anyone with the code can join right now."}
        </p>
        <div className="flex gap-2">
          <TextInput
            id="room-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            maxLength={LIMITS.passwordMax}
            autoComplete="off"
          />
          <Button variant="felt" className="h-12 shrink-0" disabled={!password || savingPassword} onClick={() => onPassword(password)}>
            Set
          </Button>
        </div>
        {room.hasPassword && (
          <Button variant="ghost" className="mt-2" disabled={savingPassword} onClick={() => onPassword("")}>
            Remove password
          </Button>
        )}
      </div>
    </div>
  );
}
