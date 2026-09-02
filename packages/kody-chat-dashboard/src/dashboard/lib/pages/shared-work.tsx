import { SharedWorkManager } from "../components/SharedWorkManager";

export default function SharedWorkPage({
  initialRecordId,
}: {
  initialRecordId?: string;
}) {
  return <SharedWorkManager initialRecordId={initialRecordId} />;
}
