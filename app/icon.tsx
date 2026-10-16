import { ImageResponse } from "next/og";
import { chipArt } from "@/lib/brand/chipArt";

// Favicon-size plus the PWA sizes the manifest points at (/icon/192, /icon/512, /icon/maskable).
export function generateImageMetadata() {
  return [
    { id: "32", size: { width: 32, height: 32 }, contentType: "image/png" },
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
    { id: "maskable", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const which = await id;
  const size = which === "maskable" ? 512 : Number(which);
  return new ImageResponse(chipArt(size, { maskable: which === "maskable" }), { width: size, height: size });
}
