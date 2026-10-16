import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { TableView } from "@/components/table/TableView";

export const metadata = { title: "Table View · ChipTable" };

export default function TableViewPage({ params }: PageProps<"/room/[id]/table">) {
  return (
    <AuthGate>
      <Suspense fallback={<LoadingScreen label="Setting up the table…" />}>
        {params.then(({ id }) => (
          <TableView key={id} roomId={id} />
        ))}
      </Suspense>
    </AuthGate>
  );
}
