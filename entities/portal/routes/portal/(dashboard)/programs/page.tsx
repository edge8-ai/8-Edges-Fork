import { redirect } from "next/navigation";

// The AI Programs list lives on the portal home. This route stays so old links
// and the create flow's parent path still resolve.
export default function AiProgramsIndexPage() {
  redirect("/portal");
}
