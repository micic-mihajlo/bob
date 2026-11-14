import "@/components/styles";
import type { Metadata } from "next";
import { BlocksLab } from "./BlocksLab";

export const metadata: Metadata = {
  title: "Blocks lab",
};

export default function BlocksLabPage() {
  return <BlocksLab />;
}
