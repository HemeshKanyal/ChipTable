import { ImageResponse } from "next/og";
import { chipArt } from "@/lib/brand/chipArt";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon: no transparency, so the chip sits on felt.
export default function AppleIcon() {
  return new ImageResponse(chipArt(180, { maskable: true }), size);
}
