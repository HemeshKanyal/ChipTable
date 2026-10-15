import { AuthGate } from "@/components/auth/AuthGate";
import { HomeScreen } from "@/components/home/HomeScreen";

export default function HomePage() {
  return (
    <AuthGate>
      <HomeScreen />
    </AuthGate>
  );
}
