import { useMemo } from "react";
import { cn } from "@dashboard/lib/utils";
import { FILE_HTML_PREVIEW_SANDBOX } from "@dashboard/lib/html-preview-security";
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
  const previewDocument = useMemo(
    () => htmlPreviewDocument(content),
    [content],
  );

  return (
    <iframe
      className={cn("bg-white", className)}
      referrerPolicy="no-referrer"
      sandbox={FILE_HTML_PREVIEW_SANDBOX}
      srcDoc={previewDocument}
      title={`Preview of ${fileName}`}
    />
  );
}
