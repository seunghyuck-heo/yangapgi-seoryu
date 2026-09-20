import { notFound } from "next/navigation";
import { getTemplate } from "@/lib/templates";
import { getOverlayDoc } from "@/lib/overlays";
import { DOC_TYPE_ORDER, DocType } from "@/lib/templates/types";
import TemplateForm from "@/components/TemplateForm";
import OverlayDocumentForm from "@/components/OverlayDocumentForm";
import IdCardUploader from "@/components/IdCardUploader";

interface PreviewPageProps {
  params: Promise<{ docType: string }>;
}

function isValidDocType(value: string): value is DocType {
  return (DOC_TYPE_ORDER as string[]).includes(value);
}

const PREVIEW_PATIENT_ID = "preview-patient";

export default async function PreviewDocPage({ params }: PreviewPageProps) {
  const { docType } = await params;
  if (!isValidDocType(docType)) notFound();

  if (docType === "id_card") {
    return (
      <IdCardUploader
        patientId={PREVIEW_PATIENT_ID}
        initialStatus="draft"
        backHref="/preview"
      />
    );
  }

  const overlay = getOverlayDoc(docType);
  if (overlay) {
    return (
      <OverlayDocumentForm
        overlay={overlay}
        docType={docType}
        patientId={PREVIEW_PATIENT_ID}
        initialFormData={{}}
        initialSignedUrls={{}}
        initialStatus="draft"
        backHref="/preview"
        preview
      />
    );
  }

  const template = getTemplate(docType);
  if (!template) notFound();

  return (
    <TemplateForm
      template={template}
      patientId={PREVIEW_PATIENT_ID}
      initialFormData={{}}
      initialSignedUrls={{}}
      initialStatus="draft"
      backHref="/preview"
    />
  );
}
