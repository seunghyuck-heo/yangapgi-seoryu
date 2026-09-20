"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentTemplate, TemplateField } from "@/lib/templates/types";
import SignaturePad from "./SignaturePad";

interface TemplateFormProps {
  template: DocumentTemplate;
  patientId: string;
  initialFormData: Record<string, unknown>;
  initialSignedUrls: Record<string, string>;
  initialStatus: "draft" | "completed";
  backHref: string;
}

function defaultsFromTemplate(template: DocumentTemplate): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const section of template.sections) {
    for (const row of section.rows) {
      for (const field of row.fields) {
        if (field.type === "static") continue;
        if (field.default !== undefined) data[field.key] = field.default;
      }
    }
  }
  return data;
}

export default function TemplateForm({
  template,
  patientId,
  initialFormData,
  initialSignedUrls,
  backHref,
}: TemplateFormProps) {
  const router = useRouter();
  const defaults = useMemo(() => defaultsFromTemplate(template), [template]);
  const [formData, setFormData] = useState<Record<string, unknown>>({
    ...defaults,
    ...initialFormData,
  });
  const [signatureDisplayUrls, setSignatureDisplayUrls] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const section of template.sections) {
      for (const row of section.rows) {
        for (const field of row.fields) {
          if (field.type !== "signature") continue;
          const path = initialFormData[field.key];
          if (typeof path === "string" && initialSignedUrls[path]) {
            map[field.key] = initialSignedUrls[path];
          }
        }
      }
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formTopRef = useRef<HTMLDivElement | null>(null);

  function setField(key: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSignatureSave(field: TemplateField, dataUrl: string) {
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        docType: template.docType,
        kind: "signature",
        fieldKey: field.key,
        dataUrl,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "서명 저장에 실패했습니다");
      return;
    }
    setField(field.key, json.path);
    setSignatureDisplayUrls((prev) => ({ ...prev, [field.key]: dataUrl }));
  }

  async function handleSubmit(targetStatus: "draft" | "completed") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${patientId}/${template.docType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_data: formData, status: targetStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "저장에 실패했습니다");
        return;
      }
      if (targetStatus === "completed") {
        router.push(backHref);
      }
    } finally {
      setSaving(false);
    }
  }

  function renderField(field: TemplateField) {
    if (field.type === "static") {
      return (
        <div className="field field--static" key={field.key}>
          {field.text}
        </div>
      );
    }

    const value = formData[field.key];

    if (field.type === "signature") {
      return (
        <div className="field field--signature" key={field.key}>
          <SignaturePad
            key={signatureDisplayUrls[field.key] ?? "empty"}
            label={field.label}
            existingUrl={signatureDisplayUrls[field.key]}
            onSave={(dataUrl) => handleSignatureSave(field, dataUrl)}
          />
        </div>
      );
    }

    if (field.type === "checkbox") {
      return (
        <label className="field field--checkbox" key={field.key}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => setField(field.key, e.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      );
    }

    return (
      <label className="field field--text" key={field.key}>
        <span className="field__label">{field.label}</span>
        <input
          type={field.type === "date" ? "date" : "text"}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => setField(field.key, e.target.value)}
        />
        {field.note && <span className="field__note">{field.note}</span>}
      </label>
    );
  }

  return (
    <div className="doc-page">
      <div className="doc-page__toolbar no-print">
        <button type="button" className="doc-page__back" onClick={() => router.push(backHref)}>
          ← 목록으로
        </button>
      </div>

      {error && <div className="error-banner no-print">{error}</div>}

      <div className="doc-sheet" ref={formTopRef}>
        <h1 className="doc-sheet__title">{template.title}</h1>
        {template.subtitle && <p className="doc-sheet__subtitle">{template.subtitle}</p>}

        {template.sections.map((section, sIdx) => (
          <section className="doc-section" key={sIdx}>
            {section.title && <h2 className="doc-section__title">{section.title}</h2>}
            {section.description && (
              <pre className="doc-section__description">{section.description}</pre>
            )}
            {section.rows.length > 0 && (
              <table className="doc-table">
                <tbody>
                  {section.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.label !== undefined && <th className="doc-table__label">{row.label}</th>}
                      <td colSpan={row.label === undefined ? 2 : 1} className="doc-table__content">
                        <div className="doc-table__fields">
                          {row.fields.map((field) => renderField(field))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>

      <div className="action-bar no-print">
        <button type="button" onClick={() => window.print()}>
          인쇄 / PDF
        </button>
        <button type="button" onClick={() => handleSubmit("draft")} disabled={saving}>
          임시저장
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => handleSubmit("completed")}
          disabled={saving}
        >
          {saving ? "저장 중..." : "작성 완료"}
        </button>
      </div>
    </div>
  );
}
