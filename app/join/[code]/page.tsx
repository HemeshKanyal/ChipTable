import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { JoinScreen } from "@/components/join/JoinScreen";
import { LoadingScreen } from "@/components/layout/LoadingScreen";

export const metadata = { title: "Join a table · ChipTable" };

export default function JoinPage({ params }: PageProps<"/join/[code]">) {
  return (
    <AuthGate>
      <Suspense fallback={<LoadingScreen />}>
        {params.then(({ code }) => (
          <JoinScreen key={code} rawCode={code} />
        ))}
      </Suspense>
    </AuthGate>
  );
}
