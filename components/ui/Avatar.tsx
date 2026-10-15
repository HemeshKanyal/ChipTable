"use client";

import { useState } from "react";

interface AvatarProps {
  name: string;
  photoURL?: string | null;
  size?: number;
  className?: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({ name, photoURL, size = 36, className = "" }: AvatarProps) {
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  const ring = "rounded-full ring-2 ring-gold-500/60 ring-offset-2 ring-offset-felt-900";

  if (photoURL && failedURL !== photoURL) {
    return (
      // Google profile photos are tiny and come from many hosts; next/image adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoURL}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailedURL(photoURL)}
        style={style}
        className={`${ring} shrink-0 object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className={`${ring} inline-flex shrink-0 items-center justify-center bg-felt-600 font-semibold text-gold-200 ${className}`}
    >
      {initials(name)}
    </span>
  );
}
