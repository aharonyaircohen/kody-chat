import { useMemo } from "react";
import DOMPurify from "dompurify";
import { cn } from "@dashboard/lib/utils";
import { htmlPreviewDocument } from "../lib/html-preview";

interface HtmlPreviewProps {
  className?: string;
  content: string;
  fileName: string;
}

export function HtmlPreview({
  className,
  content,
  fileName,
}: HtmlPreviewProps) {
  const sanitizedContent = useMemo(
    () =>
      DOMPurify.sanitize(content, {
        ALLOWED_URI_REGEXP: /^(?:(?:blob|data):|#)/i,
        FORBID_TAGS: [
          "base",
          "embed",
          "form",
          "iframe",
          "link",
          "meta",
          "object",
          "script",
        ],
        WHOLE_DOCUMENT: true,
      }),
    [content],
  );

  return (
    <iframe
      className={cn("bg-white", className)}
      referrerPolicy="no-referrer"
      sandbox=""
      srcDoc={htmlPreviewDocument(sanitizedContent)}
      title={`Preview of ${fileName}`}
    />
  );
}
