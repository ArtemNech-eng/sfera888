import type { Metadata } from "next";
import { WorkRulesView } from "./WorkRulesView";

export const metadata: Metadata = {
  title: "Правила работы",
};

export default function WorkRulesPage() {
  return <WorkRulesView />;
}
