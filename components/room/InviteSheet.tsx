"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { CheckIcon, CopyIcon, LockIcon, ShareIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";

interface InviteSheetProps {
  open: boolean;
  onClose: () => void;
  roomName: string;
  code: string;
  hasPassword: boolean;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back for plain-http LAN testing.
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

export function InviteSheet({ open, onClose, roomName, code, hasPassword }: InviteSheetProps) {
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/join/${code}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!open || !link) return;
    let cancelled = false;
    QRCode.toDataURL(link, {
      margin: 1,
      width: 480,
      errorCorrectionLevel: "M",
      color: { dark: "#061f13", light: "#f5efe0" },
    }).then((url) => !cancelled && setQr(url));
    return () => {
      cancelled = true;
    };
  }, [open, link]);

  async function onCopy() {
    if (await copyText(link)) {
      setCopied(true);
      toast("Link copied", "success");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast("Couldn't copy. Long-press the link instead.", "error");
    }
  }

  async function onShare() {
    try {
      await navigator.share({ title: roomName, text: `Join "${roomName}" on ChipTable (code ${code})`, url: link });
    } catch {
      // Dismissed.
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Invite players">
      <div className="flex flex-col items-center gap-4 text-center">
        <div>
          <p className="text-xs uppercase tracking-widest text-ivory-muted">Join code</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-gold-200 tabular-nums">{code}</p>
        </div>

        <div className="rounded-2xl bg-ivory p-2 shadow-gold-glow">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR code for joining ${roomName}`} width={200} height={200} className="h-50 w-50" />
          ) : (
            <div className="h-50 w-50 animate-pulse rounded-xl bg-felt-900/10" />
          )}
        </div>

        <p className="w-full truncate rounded-xl border gold-hairline bg-felt-950/60 px-3 py-2 font-mono text-xs text-ivory-muted select-all">
          {link}
        </p>

        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="felt" onClick={onCopy} className={canShare ? "" : "col-span-2"}>
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />} {copied ? "Copied" : "Copy link"}
          </Button>
          {canShare && (
            <Button onClick={onShare}>
              <ShareIcon size={16} /> Share
            </Button>
          )}
        </div>

        {hasPassword && (
          <p className="flex items-center gap-1.5 text-xs text-ivory-muted">
            <LockIcon size={12} /> This room has a password. Tell people in person.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
