import CareCardForm from "@/components/CareCardForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CareCardPage({ params }: PageProps) {
  const { id } = await params;
  return <CareCardForm patientId={id} backHref={`/patients/${id}`} />;
}
