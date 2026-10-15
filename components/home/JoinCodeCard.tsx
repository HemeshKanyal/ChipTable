"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CODE_LENGTH, isValidJoinCode, normalizeJoinCode } from "@/lib/room/code";

export function JoinCodeCard() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = isValidJoinCode(code);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/join/${code}`);
      }}
      className="flex items-center gap-2 rounded-2xl border gold-hairline bg-felt-900/50 p-2 pl-4"
    >
      <label htmlFor="join-code" className="shrink-0 text-sm text-ivory-muted">
        Have a code?
      </label>
      <input
        id="join-code"
        value={code}
        onChange={(e) => setCode(normalizeJoinCode(e.target.value).slice(0, CODE_LENGTH))}
        placeholder="K7Q2MX"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="h-10 min-w-0 flex-1 bg-transparent text-center font-mono text-lg uppercase tracking-[0.25em] text-gold-200 outline-none placeholder:text-ivory-muted/30"
      />
      <Button type="submit" variant={valid ? "gold" : "felt"} disabled={!valid}>
        Join
      </Button>
    </form>
  );
}
