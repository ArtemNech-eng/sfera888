import type { Metadata } from "next";
import { PendingContractView } from "./PendingContractView";

export const metadata: Metadata = {
  title: "Подписание договора",
};

export default function PendingContractPage() {
  return <PendingContractView />;
}
