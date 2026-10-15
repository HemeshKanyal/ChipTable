import { AuthGate } from "@/components/auth/AuthGate";
import { CreateRoomScreen } from "@/components/rooms/CreateRoomScreen";

export const metadata = { title: "New room · ChipTable" };

export default function NewRoomPage() {
  return (
    <AuthGate>
      <CreateRoomScreen />
    </AuthGate>
  );
}
