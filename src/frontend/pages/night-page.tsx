import { useParams } from "@tanstack/react-router";
import { NightView } from "@/components/night/night-view";

export default function NightPage() {
  const { id } = useParams({ from: "/nights/$id" });
  return <NightView eventId={id} />;
}
