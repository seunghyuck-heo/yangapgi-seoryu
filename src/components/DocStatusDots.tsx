import { DOC_TYPE_ICONS, DOC_TYPE_LABELS, DOC_TYPE_ORDER, DocType } from "@/lib/templates/types";
import { PatientDocument } from "@/lib/db/types";

interface DocStatusDotsProps {
  documents: PatientDocument[];
}

export default function DocStatusDots({ documents }: DocStatusDotsProps) {
  const completedByType = new Map<DocType, boolean>();
  for (const doc of documents) {
    completedByType.set(doc.doc_type, doc.status === "completed");
  }

  return (
    <div className="doc-status-dots">
      {DOC_TYPE_ORDER.map((docType) => {
        const isComplete = completedByType.get(docType) ?? false;
        return (
          <span
            key={docType}
            className={`doc-status-dot ${isComplete ? "doc-status-dot--done" : ""}`}
            title={DOC_TYPE_LABELS[docType]}
          >
            {DOC_TYPE_ICONS[docType]}
          </span>
        );
      })}
    </div>
  );
}
