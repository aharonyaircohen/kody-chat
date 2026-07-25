const HTML_PREVIEW_CONTENT_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function isHtmlFile(path: string): boolean {
  return /\.html?$/i.test(path);
}

export function htmlPreviewDocument(content: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CONTENT_POLICY}">\n${content}`;
}
