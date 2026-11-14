import type { Metadata } from "next";
import { FacesLab } from "./FacesLab";

export const metadata: Metadata = {
  title: "Faces lab",
};

export default function FacesLabPage() {
  return <FacesLab />;
}
