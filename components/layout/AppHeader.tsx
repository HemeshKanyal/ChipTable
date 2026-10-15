import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { UserMenu } from "./UserMenu";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b gold-hairline bg-felt-950/70 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Chip value={1000} size={26} plain />
          <span className="text-gold font-serif text-xl font-bold">ChipTable</span>
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
