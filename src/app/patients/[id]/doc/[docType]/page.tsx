import { notFound } from "next/navigation";
import { collectStoragePaths, createSignedUrls, getDocument } from "@/lib/db/documents";
import { getTemplate } from "@/lib/templates";
import { getOverlayDoc } from "@/lib/overlays";
import { DOC_TYPE_ORDER, DocType } from "@/lib/templates/types";
import TemplateForm from "@/components/TemplateForm";
import OverlayDocumentForm from "@/components/OverlayDocumentForm";
import IdCardUploader from "@/components/IdCardUploader";

interface DocPageProps {
  params: Promise<{ id: string; docType: string }>;
  searchParams: Promise<{ from?: string }>;
}

function isValidDocType(value: string): value is DocType {
  return (DOC_TYPE_ORDER as string[]).includes(value);
}

export default async function DocumentPage({ params, searchParams }: DocPageProps) {
  const { id, docType } = await params;
  const { from } = await searchParams;
  if (!isValidDocType(docType)) notFound();

  const document = await getDocument(id, docType);
  const backHref = from === "submit" ? "/submit" : `/patients/${id}`;

  if (docType === "id_card") {
    const signedUrls = await createSignedUrls(document?.file_path ? [document.file_path] : []);
    return (
      <IdCardUploader
        patientId={id}
        initialUrl={document?.file_path ? signedUrls[document.file_path] : undefined}
        initialStatus={document?.status ?? "draft"}
        backHref={backHref}
      />
    );
  }

  const signedUrls = await createSignedUrls(collectStoragePaths(document));

  const overlay = getOverlayDoc(docType);
  if (overlay) {
    return (
      <OverlayDocumentForm
        overlay={overlay}
        docType={docType}
        patientId={id}
        initialFormData={document?.form_data ?? {}}
        initialSignedUrls={signedUrls}
        initialStatus={document?.status ?? "draft"}
        backHref={backHref}
      />
    );
  }

  const template = getTemplate(docType);
  if (!template) notFound();

  return (
    <TemplateForm
      template={template}
      patientId={id}
      initialFormData={document?.form_data ?? {}}
      initialSignedUrls={signedUrls}
      initialStatus={document?.status ?? "draft"}
      backHref={backHref}
    />
  );
}
