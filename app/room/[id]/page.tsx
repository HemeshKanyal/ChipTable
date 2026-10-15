import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { RoomScreen } from "@/components/room/RoomScreen";

export const metadata = { title: "Table · ChipTable" };

export default function RoomPage({ params, searchParams }: PageProps<"/room/[id]">) {
  return (
    <AuthGate>
      <Suspense fallback={<LoadingScreen label="Pulling up the table…" />}>
        {Promise.all([params, searchParams]).then(([{ id }, query]) => (
          <RoomScreen key={id} roomId={id} openInvite={query.invite === "1"} />
        ))}
      </Suspense>
    </AuthGate>
  );
}
