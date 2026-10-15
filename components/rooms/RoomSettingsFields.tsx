"use client";

import { ChoicePills, FieldError, Label, TextInput } from "@/components/ui/Field";
import { formatChips } from "@/lib/chips";
import { LIMITS, type GameMode, type RoomSettings, type SettingsErrors } from "@/lib/room/settings";

/** Form values as typed (numbers kept as strings so fields can be empty mid-edit). */
export interface RoomForm {
  name: string;
  mode: GameMode;
  startingStack: string;
  sb: string;
  bb: string;
  maxPlayers: number;
}

export function formFromSettings(name: string, s: RoomSettings): RoomForm {
  return {
    name,
    mode: s.mode,
    startingStack: String(s.startingStack),
    sb: String(s.sb),
    bb: String(s.bb),
    maxPlayers: s.maxPlayers,
  };
}

const toInt = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);

export function settingsFromForm(f: RoomForm): RoomSettings {
  return {
    startingStack: toInt(f.startingStack),
    sb: toInt(f.sb),
    bb: toInt(f.bb),
    mode: f.mode,
    maxPlayers: f.maxPlayers,
  };
}

const STACK_PRESETS = [500, 1000, 2000, 5000, 10000];
const BLIND_PRESETS: [number, number][] = [
  [1, 2],
  [5, 10],
  [10, 20],
  [25, 50],
  [50, 100],
];

const MODES: { value: GameMode; title: string; blurb: string }[] = [
  {
    value: "guided",
    title: "Guided",
    blurb: "Proper Hold'em: blinds, turns, raises and side pots handled for you.",
  },
  {
    value: "wallet",
    title: "Wallet",
    blurb: "Free-form: anyone tosses chips in the pot, then the table votes a winner.",
  },
];

interface Props {
  form: RoomForm;
  onChange: React.Dispatch<React.SetStateAction<RoomForm>>;
  errors: SettingsErrors;
  /** Lowest allowed max players, e.g. so nobody's seat disappears. */
  minPlayers?: number;
}

export function RoomSettingsFields({ form, onChange, errors, minPlayers = LIMITS.minPlayers }: Props) {
  const set = <K extends keyof RoomForm>(key: K, value: RoomForm[K]) => onChange((f) => ({ ...f, [key]: value }));
  const stack = toInt(form.startingStack);
  const bb = toInt(form.bb);
  const depth = stack > 0 && bb > 0 ? Math.floor(stack / bb) : null;
  const blindKey = `${form.sb}/${form.bb}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Label htmlFor="room-name">Room name</Label>
        <TextInput
          id="room-name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Friday Night Poker"
          maxLength={LIMITS.nameMax}
          autoComplete="off"
        />
        <FieldError>{errors.name}</FieldError>
      </div>

      <div>
        <Label>Game mode</Label>
        <div role="radiogroup" aria-label="Game mode" className="grid grid-cols-2 gap-2">
          {MODES.map((m) => {
            const active = form.mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set("mode", m.value)}
                className={`rounded-2xl border p-3 text-left transition ${
                  active ? "border-gold-400 bg-gold-400/10 shadow-gold-glow" : "gold-hairline bg-felt-950/40"
                }`}
              >
                <span className={`block font-serif text-lg font-bold ${active ? "text-gold-200" : "text-ivory"}`}>
                  {m.title}
                </span>
                <span className="mt-1 block text-xs leading-snug text-ivory-muted">{m.blurb}</span>
              </button>
            );
          })}
        </div>
        <FieldError>{errors.mode}</FieldError>
      </div>

      <div>
        <Label htmlFor="starting-stack">Starting stack</Label>
        <ChoicePills
          label="Starting stack presets"
          options={STACK_PRESETS.map((v) => ({ value: v, label: formatChips(v) }))}
          value={STACK_PRESETS.includes(stack) ? stack : null}
          onChange={(v) => set("startingStack", String(v))}
        />
        <TextInput
          id="starting-stack"
          className="mt-2 tabular-nums"
          inputMode="numeric"
          value={form.startingStack}
          onChange={(e) => set("startingStack", e.target.value.replace(/\D/g, ""))}
          aria-label="Custom starting stack"
        />
        <FieldError>{errors.startingStack}</FieldError>
      </div>

      <div>
        <Label>Blinds</Label>
        <ChoicePills
          label="Blind presets"
          options={BLIND_PRESETS.map(([s, b]) => ({ value: `${s}/${b}`, label: `${s}/${b}` }))}
          value={BLIND_PRESETS.some(([s, b]) => `${s}/${b}` === blindKey) ? blindKey : null}
          onChange={(v) => {
            const [s, b] = v.split("/");
            onChange((f) => ({ ...f, sb: s, bb: b }));
          }}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <TextInput
              inputMode="numeric"
              className="tabular-nums"
              value={form.sb}
              onChange={(e) => set("sb", e.target.value.replace(/\D/g, ""))}
              aria-label="Small blind"
              placeholder="SB"
            />
            <p className="mt-1 text-center text-[11px] text-ivory-muted">Small blind</p>
          </div>
          <div>
            <TextInput
              inputMode="numeric"
              className="tabular-nums"
              value={form.bb}
              onChange={(e) => set("bb", e.target.value.replace(/\D/g, ""))}
              aria-label="Big blind"
              placeholder="BB"
            />
            <p className="mt-1 text-center text-[11px] text-ivory-muted">Big blind</p>
          </div>
        </div>
        <FieldError>{errors.sb ?? errors.bb}</FieldError>
        {depth !== null && !errors.sb && !errors.bb && (
          <p className="mt-1.5 text-xs text-ivory-muted">Everyone starts {depth} big blinds deep.</p>
        )}
      </div>

      <div>
        <Label>Seats</Label>
        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-xl border gold-hairline bg-felt-950/40">
            <button
              type="button"
              aria-label="Fewer seats"
              disabled={form.maxPlayers <= minPlayers}
              onClick={() => onChange((f) => ({ ...f, maxPlayers: Math.max(minPlayers, f.maxPlayers - 1) }))}
              className="h-11 w-11 text-xl text-ivory disabled:opacity-30"
            >
              −
            </button>
            <span className="w-8 text-center text-lg font-bold tabular-nums">{form.maxPlayers}</span>
            <button
              type="button"
              aria-label="More seats"
              disabled={form.maxPlayers >= LIMITS.maxPlayers}
              onClick={() => onChange((f) => ({ ...f, maxPlayers: Math.min(LIMITS.maxPlayers, f.maxPlayers + 1) }))}
              className="h-11 w-11 text-xl text-ivory disabled:opacity-30"
            >
              +
            </button>
          </div>
          <div className="flex flex-wrap gap-1" aria-hidden>
            {Array.from({ length: LIMITS.maxPlayers }, (_, i) => (
              <span
                key={i}
                className={`h-3 w-3 rounded-full transition ${i < form.maxPlayers ? "bg-gold-400" : "bg-ivory/10"}`}
              />
            ))}
          </div>
        </div>
        <FieldError>{errors.maxPlayers}</FieldError>
      </div>
    </div>
  );
}
