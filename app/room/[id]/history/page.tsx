import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { HistoryScreen } from "@/components/history/HistoryScreen";
import { LoadingScreen } from "@/components/layout/LoadingScreen";

export const metadata = { title: "History · ChipTable" };

export default function HistoryPage({ params }: PageProps<"/room/[id]/history">) {
  return (
    <AuthGate>
      <Suspense fallback={<LoadingScreen label="Digging out the records…" />}>
        {params.then(({ id }) => (
          <HistoryScreen key={id} roomId={id} />
        ))}
      </Suspense>
    </AuthGate>
  );
}
